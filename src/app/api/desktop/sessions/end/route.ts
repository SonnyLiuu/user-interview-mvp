import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interactions, people, person_events, projects } from '@/lib/db/schema';
import { getDesktopUser } from '@/lib/desktop-auth';

type TopicInput = {
  id?: string;
  label?: string;
  checked?: boolean;
};

type EndSessionInput = {
  personId?: string;
  startedAt?: string;
  endedAt?: string;
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

  const checkedTopics = topics.filter((topic) => topic.checked);
  await db.insert(person_events).values({
    person_id: body.personId,
    type: 'desktop_call_session_saved',
    metadata: {
      interaction_id: created.id,
      started_at: body.startedAt ?? null,
      ended_at: completedAt.toISOString(),
      topic_count: topics.length,
      checked_count: checkedTopics.length,
      checked_labels: checkedTopics.map((topic) => topic.label ?? ''),
    },
  });

  return NextResponse.json({ ok: true, interaction: created }, { status: 201 });
}
