import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interactions, people, person_events, projects, transcripts } from '@/lib/db/schema';
import { getDesktopUser } from '@/lib/desktop-auth';

type TopicInput = {
  id?: string;
  label?: string;
  checked?: boolean;
  checkedBy?: string;
  checkedAt?: string;
  evidence?: string;
  manualOverride?: boolean;
};

type EndSessionInput = {
  personId?: string;
  startedAt?: string;
  endedAt?: string;
  liveSessionId?: string;
  topics?: TopicInput[];
  notesRaw?: string;
  transcriptRaw?: string;
};

function topicSummary(topics: TopicInput[]) {
  const checked = topics.filter((topic) => topic.checked);
  const unchecked = topics.filter((topic) => !topic.checked);
  const lines = [
    `Checked topics (${checked.length}/${topics.length}):`,
    ...(checked.length ? checked.map((topic) => `- ${topic.label ?? ''}`) : ['- None']),
    '',
    `Unchecked topics (${unchecked.length}/${topics.length}):`,
    ...(unchecked.length ? unchecked.map((topic) => `- ${topic.label ?? ''}`) : ['- None']),
  ];
  return lines.join('\n');
}

export async function POST(request: Request) {
  const user = await getDesktopUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: EndSessionInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 });
  }

  const owned = await db
    .select({ id: people.id })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .where(and(eq(people.id, body.personId), eq(projects.user_id, user.id)))
    .limit(1);

  if (!owned[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const topics = Array.isArray(body.topics)
    ? body.topics.filter((topic) => typeof topic.label === 'string' && topic.label.trim())
    : [];
  const summary = topicSummary(topics);
  const userNotes = body.notesRaw?.trim() ?? '';
  const notesRaw = userNotes ? `${summary}\n\nNotes:\n${userNotes}` : summary;
  const transcriptRaw = body.transcriptRaw?.trim() ?? '';
  const completedAt = body.endedAt ? new Date(body.endedAt) : new Date();

  if (Number.isNaN(completedAt.getTime())) {
    return NextResponse.json({ error: 'endedAt invalid' }, { status: 400 });
  }

  const [created] = await db
    .insert(interactions)
    .values({
      person_id: body.personId,
      type: 'call',
      notes_raw: notesRaw,
      transcript_raw: transcriptRaw,
      completed_at: completedAt,
    })
    .returning();

  await db
    .update(people)
    .set({
      board_status: 'completed',
      outcome: 'successful_call',
      expires_at: null,
      updated_at: completedAt,
    })
    .where(eq(people.id, body.personId));

  const transcriptContent = transcriptRaw || userNotes;
  if (transcriptContent) {
    await db.insert(transcripts).values({
      person_id: body.personId,
      content: transcriptContent,
      type: 'call',
    });
  }

  const checkedTopics = topics.filter((topic) => topic.checked);
  const autoCheckedTopics = checkedTopics.filter((topic) => topic.checkedBy === 'gpt_realtime');
  await db.insert(person_events).values({
    person_id: body.personId,
    type: 'desktop_call_session_saved',
    metadata: {
      interaction_id: created.id,
      live_session_id: body.liveSessionId ?? null,
      started_at: body.startedAt ?? null,
      ended_at: completedAt.toISOString(),
      topic_count: topics.length,
      checked_count: checkedTopics.length,
      checked_labels: checkedTopics.map((topic) => topic.label ?? ''),
      auto_checked_count: autoCheckedTopics.length,
      auto_checked_topics: autoCheckedTopics.map((topic) => ({
        id: topic.id ?? null,
        label: topic.label ?? '',
        checked_at: topic.checkedAt ?? null,
        evidence: topic.evidence ?? null,
      })),
      manual_override_count: topics.filter((topic) => topic.manualOverride).length,
    },
  });

  return NextResponse.json({ ok: true, interaction: created }, { status: 201 });
}
