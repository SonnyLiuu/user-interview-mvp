import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { buildBackendUrl } from '@/lib/backend-utils';
import { db } from '@/lib/db';
import { interactions, people, person_events, projects, transcripts } from '@/lib/db/schema';
import { getDesktopUser } from '@/lib/desktop-auth';
import { buildDesktopSessionNotesRaw, type DesktopSessionTopicInput } from '@/lib/desktop-session-summary';
import { matchEventMetadata, refreshProjectMatchProfileFromSignals } from '@/lib/match-profile';

type TopicInput = DesktopSessionTopicInput;

type EndSessionInput = {
  personId?: string;
  startedAt?: string;
  endedAt?: string;
  liveSessionId?: string;
  liveToken?: string;
  topics?: TopicInput[];
  notesRaw?: string;
  transcriptRaw?: string;
};

async function fetchBackendTranscript(body: EndSessionInput) {
  if (!body.liveSessionId || !body.liveToken) return null;

  try {
    const res = await fetch(
      buildBackendUrl(`/v1/desktop/live-sessions/${encodeURIComponent(body.liveSessionId)}`),
      {
        headers: { authorization: `Bearer ${body.liveToken}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    const payload = await res.json() as { transcriptRaw?: string };
    return typeof payload.transcriptRaw === 'string' ? payload.transcriptRaw : null;
  } catch {
    return null;
  }
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
  const personId = body.personId;

  const owned = await db
    .select({ person: people })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .where(and(eq(people.id, personId), eq(projects.user_id, user.id)))
    .limit(1);

  if (!owned[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const topics = Array.isArray(body.topics)
    ? body.topics.filter((topic) => typeof topic.label === 'string' && topic.label.trim())
    : [];
  const userNotes = body.notesRaw?.trim() ?? '';
  const notesRaw = buildDesktopSessionNotesRaw(topics, userNotes);
  const transcriptRaw = body.transcriptRaw?.trim() ?? '';
  const completedAt = body.endedAt ? new Date(body.endedAt) : new Date();

  if (Number.isNaN(completedAt.getTime())) {
    return NextResponse.json({ error: 'endedAt invalid' }, { status: 400 });
  }

  if (body.liveSessionId) {
    const [existing] = await db
      .select()
      .from(interactions)
      .where(eq(interactions.live_session_id, body.liveSessionId))
      .limit(1);
    if (existing) {
      return NextResponse.json({ ok: true, interaction: existing, idempotent: true }, { status: 200 });
    }
  }

  const backendTranscriptRaw = (await fetchBackendTranscript(body))?.trim() ?? '';
  const finalTranscriptRaw = backendTranscriptRaw || transcriptRaw;

  const checkedTopics = topics.filter((topic) => topic.checked);
  const autoCheckedTopics = checkedTopics.filter((topic) => topic.checkedBy === 'gpt_realtime');
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(interactions)
      .values({
        person_id: personId,
        live_session_id: body.liveSessionId ?? null,
        type: 'call',
        notes_raw: notesRaw,
        transcript_raw: finalTranscriptRaw,
        completed_at: completedAt,
      })
      .returning();

    await tx
      .update(people)
      .set({
        board_status: 'completed',
        outcome: 'successful_call',
        expires_at: null,
        updated_at: completedAt,
      })
      .where(eq(people.id, personId));

    const transcriptContent = finalTranscriptRaw || userNotes;
    if (transcriptContent) {
      await tx.insert(transcripts).values({
        person_id: personId,
        content: transcriptContent,
        type: 'call',
      });
    }

    await tx.insert(person_events).values({
      person_id: personId,
      type: 'desktop_call_session_saved',
      metadata: {
        interaction_id: inserted.id,
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
        ...matchEventMetadata(owned[0].person, {}, 4),
      },
    });
    return inserted;
  });

  if (owned[0].person.project_id) await refreshProjectMatchProfileFromSignals(owned[0].person.project_id, null);

  return NextResponse.json({ ok: true, interaction: created }, { status: 201 });
}
