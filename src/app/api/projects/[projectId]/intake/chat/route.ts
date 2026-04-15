import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, project_briefs, project_intake } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { textRouteError } from '@/lib/api';
import { extractIntakeFields } from '@/lib/ai/extract-intake';
import { inngest } from '@/inngest/client';

const INTAKE_SYSTEM_PROMPT = `You are an experienced startup advisor running a structured founder office hours session. Your goal is to build a complete picture of the founder's startup idea.

Cover these 5 areas progressively:
1. The Idea — what they're building, for whom, why now
2. The Problem — pain, frequency, current workarounds, why unsolved
3. The Customer — who feels it, who pays, user vs buyer
4. The Opportunity — who has budget, urgency, most promising niche
5. Risks and Assumptions — what must be true, biggest failure reasons

Ask 1–2 questions at a time. Probe vague answers. Don't rush through topics.

When you have enough information across all 5 areas, end your message with this exact JSON block on its own line:
{"intake_complete": true}

If the project already has a brief (you'll be told), act as an ongoing advisor — help the founder refine thinking, explore new angles, challenge weak assumptions. Do not re-run the intake flow.`;

type ConversationMessage = { role: 'assistant' | 'user'; content: string };

type Params = { params: Promise<{ projectId: string }> };

function getSystemPrompt(hasBrief: boolean): string {
  if (hasBrief) {
    return `${INTAKE_SYSTEM_PROMPT}

This project already has a current brief.
Stay in ongoing advisor mode.
Do not output {"intake_complete": true}.
Do not restart the structured intake flow.`;
  }

  return `${INTAKE_SYSTEM_PROMPT}

This project does not have a brief yet.
Run the structured intake flow and only output {"intake_complete": true} once you truly have enough information.`;
}

function getProvider(): 'openai' | 'anthropic' {
  return process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
}

async function streamFromOpenAI(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<ReadableStream> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) controller.enqueue(new TextEncoder().encode(text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

async function streamFromAnthropic(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<ReadableStream> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
      .limit(1);
    if (!project) return new Response('Not found', { status: 404 });

    const [brief] = await db
      .select({ id: project_briefs.id })
      .from(project_briefs)
      .where(and(eq(project_briefs.project_id, projectId), eq(project_briefs.is_current, true)))
      .limit(1);
    const hasBrief = !!brief;

    const { message } = await req.json() as { message: string };
    if (!message?.trim()) return new Response('Message required', { status: 400 });

    const [intake] = await db
      .select()
      .from(project_intake)
      .where(eq(project_intake.project_id, projectId))
      .limit(1);

    const conversation: ConversationMessage[] = (intake?.conversation as ConversationMessage[] | null) ?? [];

    // '__init__' is a client-side trigger to open the conversation — don't persist it
    const isInit = message === '__init__';
    const updatedConversation: ConversationMessage[] = isInit
      ? conversation
      : [...conversation, { role: 'user', content: message }];

    // Anthropic and OpenAI both require at least one message.
    // For the opening trigger on an empty conversation, use a synthetic opener.
    const apiMessages: { role: 'user' | 'assistant'; content: string }[] =
      updatedConversation.length === 0
        ? [{ role: 'user', content: 'Hello, I want to discuss my startup idea.' }]
        : updatedConversation.map((m) => ({ role: m.role, content: m.content }));

    let fullResponse = '';
    const systemPrompt = getSystemPrompt(hasBrief);

    const provider = getProvider();
    const providerStream =
      provider === 'anthropic'
        ? await streamFromAnthropic(systemPrompt, apiMessages)
        : await streamFromOpenAI(systemPrompt, apiMessages);

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = providerStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullResponse += new TextDecoder().decode(value, { stream: true });
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          console.error('Stream error:', err);
          controller.enqueue(new TextEncoder().encode('\n\n[Error: could not reach AI. Please try again.]'));
          controller.close();
          return;
        }

        // Save conversation to DB
        const finalConversation: ConversationMessage[] = [
          ...updatedConversation,
          { role: 'assistant', content: fullResponse },
        ];

        if (intake) {
          await db
            .update(project_intake)
            .set({ conversation: finalConversation, updated_at: new Date() })
            .where(eq(project_intake.project_id, projectId));
        } else {
          await db
            .insert(project_intake)
            .values({ project_id: projectId, conversation: finalConversation });
        }

        // Check for intake completion signal
        if (!hasBrief && fullResponse.includes('"intake_complete": true')) {
          try {
            const fields = await extractIntakeFields(finalConversation);
            await db
              .update(project_intake)
              .set({ ...fields, updated_at: new Date() })
              .where(eq(project_intake.project_id, projectId));

            await db
              .update(projects)
              .set({ intake_status: 'generating', updated_at: new Date() })
              .where(eq(projects.id, projectId));

            await inngest.send({ name: 'brief/generate', data: { projectId } });
          } catch (err) {
            console.error('Failed to process intake completion:', err);
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return textRouteError(error, 'Failed to process intake chat');
  }
}
