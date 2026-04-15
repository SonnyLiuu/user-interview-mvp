import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, onboarding_sessions, onboarding_messages, onboarding_state, project_foundations } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { emptyOnboardingState, type OnboardingState, type SlotKey } from '@/lib/onboarding/slot-definitions';
import { chooseNextSlot, isOnboardingFinishable } from '@/lib/onboarding/choose-next-slot';
import { mergeSlotPatch, mergeKickoffIdea } from '@/lib/onboarding/merge-onboarding-state';
import { validateChoices } from '@/lib/onboarding/validate-choices';
import { getFallbackChoices } from '@/lib/onboarding/fallback-choices';
import { extractKickoffIdea } from '@/ai/tasks/onboarding/extract-kickoff-idea';
import { generateNextQuestionWithChoices, type GeneratedChoice } from '@/ai/tasks/onboarding/generate-next-question';
import { extractCustomSlotAnswer } from '@/ai/tasks/onboarding/extract-custom-slot-answer';
import { generateFoundationFromOnboarding } from '@/ai/tasks/foundation/generate-foundation-from-onboarding';

type Params = { params: Promise<{ projectId: string }> };

type ChatMessage = { role: 'assistant' | 'user'; content: string; messageType?: string };

type OnboardingChatRequest =
  | { type: '__init__' }
  | { type: 'kickoff'; message: string }
  | { type: 'choice'; choiceId: string }
  | { type: 'custom'; customText: string }
  | { type: 'finish' };

type CurrentTurn = {
  question: string;
  choices: GeneratedChoice[];
  customPlaceholder: string;
  targetSlot: SlotKey;
};

type OnboardingChatResponse = {
  messages: ChatMessage[];
  currentTurn: CurrentTurn | null;
  isFinishable: boolean;
  sessionStatus: string;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
      .limit(1);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = (await req.json()) as OnboardingChatRequest;

    // Load or create session + state
    let [session] = await db
      .select()
      .from(onboarding_sessions)
      .where(eq(onboarding_sessions.project_id, projectId))
      .limit(1);

    let [stateRow] = await db
      .select()
      .from(onboarding_state)
      .where(eq(onboarding_state.project_id, projectId))
      .limit(1);

    if (!session) {
      [session] = await db
        .insert(onboarding_sessions)
        .values({ project_id: projectId, status: 'active' })
        .returning();
    }

    const state: OnboardingState = (stateRow?.state_json as OnboardingState) ?? emptyOnboardingState();

    // Load existing messages
    const existingMessages = await db
      .select()
      .from(onboarding_messages)
      .where(eq(onboarding_messages.session_id, session.id))
      .orderBy(asc(onboarding_messages.created_at));

    const chatHistory: ChatMessage[] = existingMessages.map((m) => ({
      role: m.role as 'assistant' | 'user',
      content: m.content,
      messageType: m.message_type ?? undefined,
    }));

    const lastTurn = getLastTurn(session.progress_json);

    // ── __init__ ────────────────────────────────────────────────────────────
    if (body.type === '__init__') {
      // If no messages yet, seed with the kickoff question
      if (chatHistory.length === 0) {
        const kickoffQuestion = "What are you building? Tell me about your idea — what it does, who it's for, and what problem it solves.";
        await saveMessage(session.id, projectId, 'assistant', kickoffQuestion, 'question');
        chatHistory.push({ role: 'assistant', content: kickoffQuestion, messageType: 'question' });
      }

      let currentTurn = lastTurn;
      const finishable = isOnboardingFinishable(state);

      if (!currentTurn && !finishable && chatHistory.length > 1) {
        currentTurn = await generateTurn(state, chatHistory);
        await persistSessionTurn(session.id, currentTurn, 'active');
      } else if (finishable) {
        await persistSessionTurn(session.id, null, 'ready');
      }

      return NextResponse.json<OnboardingChatResponse>({
        messages: chatHistory,
        currentTurn,
        isFinishable: finishable,
        sessionStatus: finishable ? 'ready' : (session.status ?? 'active'),
      });
    }

    // ── finish ───────────────────────────────────────────────────────────────
    if (body.type === 'finish') {
      if (!isOnboardingFinishable(state)) {
        return NextResponse.json({ error: 'Not finishable yet' }, { status: 400 });
      }

      // Generate foundation
      const messagePairs = chatHistory.map((m) => ({ role: m.role, content: m.content }));
      const { foundation } = await generateFoundationFromOnboarding(messagePairs, state);

      // Save foundation
      await db.insert(project_foundations).values({
        project_id: projectId,
        foundation_json: foundation,
      });

      // Mark session complete
      await db
        .update(onboarding_sessions)
        .set({ status: 'completed', current_slot: null, progress_json: null, completed_at: new Date() })
        .where(eq(onboarding_sessions.id, session.id));

      await db
        .update(projects)
        .set({ intake_status: 'complete', updated_at: new Date() })
        .where(eq(projects.id, projectId));

      return NextResponse.json<OnboardingChatResponse>({
        messages: chatHistory,
        currentTurn: null,
        isFinishable: true,
        sessionStatus: 'completed',
      });
    }

    // ── kickoff ──────────────────────────────────────────────────────────────
    if (body.type === 'kickoff') {
      const { message } = body;

      // Save user message
      await saveMessage(session.id, projectId, 'user', message, 'custom_answer');
      chatHistory.push({ role: 'user', content: message, messageType: 'custom_answer' });

      // Extract idea summary
      const { ideaSummary, quality } = await extractKickoffIdea(message);
      const nextState = mergeKickoffIdea(state, ideaSummary, quality);
      await saveState(projectId, nextState, stateRow?.id);

      // Generate next question
      const currentTurn = await generateTurn(nextState, chatHistory);
      await persistSessionTurn(session.id, currentTurn, 'active');

      // Save assistant question
      await saveMessage(session.id, projectId, 'assistant', currentTurn.question, 'question');
      chatHistory.push({ role: 'assistant', content: currentTurn.question, messageType: 'question' });

      return NextResponse.json<OnboardingChatResponse>({
        messages: chatHistory,
        currentTurn,
        isFinishable: isOnboardingFinishable(nextState),
        sessionStatus: session.status ?? 'active',
      });
    }

    // ── choice selection ─────────────────────────────────────────────────────
    if (body.type === 'choice') {
      const activeTurn = lastTurn;
      const selectedChoice = activeTurn?.choices.find((choice) => choice.id === body.choiceId);

      if (!activeTurn || !selectedChoice) {
        return NextResponse.json({ error: 'Invalid choice for current turn' }, { status: 400 });
      }

      // Save user choice as a message
      await saveMessage(session.id, projectId, 'user', selectedChoice.label, 'choice_answer');
      chatHistory.push({ role: 'user', content: selectedChoice.label, messageType: 'choice_answer' });

      // Merge into state — choices are always 'solid' quality
      const nextState = mergeSlotPatch(state, {
        slotKey: selectedChoice.slotKey,
        value: selectedChoice.normalizedValue,
        quality: 'solid',
      });
      await saveState(projectId, nextState, stateRow?.id);

      if (isOnboardingFinishable(nextState)) {
        await persistSessionTurn(session.id, null, 'ready');
        return NextResponse.json<OnboardingChatResponse>({
          messages: chatHistory,
          currentTurn: null,
          isFinishable: true,
          sessionStatus: 'ready',
        });
      }

      const currentTurn = await generateTurn(nextState, chatHistory);
      await persistSessionTurn(session.id, currentTurn, 'active');
      await saveMessage(session.id, projectId, 'assistant', currentTurn.question, 'question');
      chatHistory.push({ role: 'assistant', content: currentTurn.question, messageType: 'question' });

      return NextResponse.json<OnboardingChatResponse>({
        messages: chatHistory,
        currentTurn,
        isFinishable: false,
        sessionStatus: session.status ?? 'active',
      });
    }

    // ── custom answer ────────────────────────────────────────────────────────
    if (body.type === 'custom') {
      const { customText } = body;
      const activeTurn = lastTurn;

      if (!activeTurn) {
        return NextResponse.json({ error: 'No active turn to answer' }, { status: 400 });
      }

      await saveMessage(session.id, projectId, 'user', customText, 'custom_answer');
      chatHistory.push({ role: 'user', content: customText, messageType: 'custom_answer' });

      const messagePairs = chatHistory.map((m) => ({ role: m.role, content: m.content }));
      const extracted = await extractCustomSlotAnswer(
        activeTurn.targetSlot,
        customText,
        messagePairs.slice(-4),
        state,
      );

      const nextState = mergeSlotPatch(state, {
        slotKey: activeTurn.targetSlot,
        value: extracted.value,
        quality: extracted.quality,
      });
      await saveState(projectId, nextState, stateRow?.id);

      if (isOnboardingFinishable(nextState)) {
        await persistSessionTurn(session.id, null, 'ready');
        return NextResponse.json<OnboardingChatResponse>({
          messages: chatHistory,
          currentTurn: null,
          isFinishable: true,
          sessionStatus: 'ready',
        });
      }

      const currentTurn = await generateTurn(nextState, chatHistory);
      await persistSessionTurn(session.id, currentTurn, 'active');
      await saveMessage(session.id, projectId, 'assistant', currentTurn.question, 'question');
      chatHistory.push({ role: 'assistant', content: currentTurn.question, messageType: 'question' });

      return NextResponse.json<OnboardingChatResponse>({
        messages: chatHistory,
        currentTurn,
        isFinishable: false,
        sessionStatus: session.status ?? 'active',
      });
    }

    return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
  } catch (error) {
    console.error('Onboarding chat error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function generateTurn(
  state: OnboardingState,
  chatHistory: ChatMessage[],
): Promise<CurrentTurn> {
  const nextSlot = chooseNextSlot(state);
  if (!nextSlot) {
    throw new Error('No next slot — onboarding should be finishable');
  }

  const messagePairs = chatHistory.map((m) => ({ role: m.role, content: m.content }));

  // Try AI generation with one fallback attempt
  let result;
  try {
    result = await generateNextQuestionWithChoices(nextSlot, messagePairs, state);
    const validation = validateChoices(result.choices, nextSlot);
    if (!validation.valid) {
      console.warn(`Choice validation failed (${validation.reason}), retrying...`);
      result = await generateNextQuestionWithChoices(nextSlot, messagePairs, state);
      const retryValidation = validateChoices(result.choices, nextSlot);
      if (!retryValidation.valid) {
        console.warn(`Retry also failed (${retryValidation.reason}), using fallback`);
        const fb = getFallbackChoices(nextSlot);
        result = { targetSlot: nextSlot, ...fb };
      }
    }
  } catch (err) {
    console.error('generateNextQuestionWithChoices failed, using fallback:', err);
    const fb = getFallbackChoices(nextSlot);
    result = { targetSlot: nextSlot, ...fb };
  }

  return result as CurrentTurn;
}

async function saveMessage(
  sessionId: string,
  projectId: string,
  role: 'assistant' | 'user',
  content: string,
  messageType: string,
) {
  await db.insert(onboarding_messages).values({
    session_id: sessionId,
    project_id: projectId,
    role,
    content,
    message_type: messageType,
  });
}

async function saveState(projectId: string, state: OnboardingState, existingId?: string) {
  if (existingId) {
    await db
      .update(onboarding_state)
      .set({ state_json: state, updated_at: new Date() })
      .where(eq(onboarding_state.project_id, projectId));
  } else {
    await db.insert(onboarding_state).values({ project_id: projectId, state_json: state });
  }
}

function getLastTurn(progressJson: unknown): CurrentTurn | null {
  return (progressJson as { lastTurn?: CurrentTurn } | null)?.lastTurn ?? null;
}

async function persistSessionTurn(
  sessionId: string,
  turn: CurrentTurn | null,
  status: 'active' | 'ready',
) {
  await db
    .update(onboarding_sessions)
    .set({
      status,
      current_slot: turn?.targetSlot ?? null,
      progress_json: turn ? { lastTurn: turn } : null,
    })
    .where(eq(onboarding_sessions.id, sessionId));
}
