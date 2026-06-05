import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, person_events } from '@/lib/db/schema';
import { shouldClearNoResponseOutcome } from '@/lib/crm';
import { matchEventMetadata, refreshProjectMatchProfileFromSignals } from '@/lib/match-profile';
import { getOwnedPerson } from '@/lib/person-ownership';

type Params = { params: Promise<{ personId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const body = await req.json() as { scheduledAt: string };
  if (!body.scheduledAt) return NextResponse.json({ error: 'scheduledAt required' }, { status: 400 });

  const scheduledAt = new Date(body.scheduledAt);
  if (isNaN(scheduledAt.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const current = await getOwnedPerson(personId, clerkUserId);
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const clearsNoResponse = current.outcome === 'no_response' && shouldClearNoResponseOutcome('scheduled');
  const [updated] = await db
    .update(people)
    .set({
      board_status: 'scheduled',
      outcome: clearsNoResponse ? null : current.outcome,
      call_scheduled_at: scheduledAt,
      expires_at: null,
      updated_at: new Date(),
    })
    .where(eq(people.id, personId))
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: 'stage_changed',
    metadata: matchEventMetadata(
      current,
      {
        to: 'scheduled',
        scheduled_at: scheduledAt.toISOString(),
        ...(clearsNoResponse ? { cleared_outcome: 'no_response' } : {}),
      },
      3,
    ),
  });
  if (current.project_id) await refreshProjectMatchProfileFromSignals(current.project_id, null);

  return NextResponse.json(updated);
}
