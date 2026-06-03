import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, person_events } from '@/lib/db/schema';
import type { CRMOutcome } from '@/lib/crm';
import { matchEventMetadata, refreshProjectMatchProfileFromSignals } from '@/lib/match-profile';
import { getOwnedPerson } from '@/lib/person-ownership';

type Params = { params: Promise<{ personId: string }> };

const VALID_OUTCOMES: CRMOutcome[] = ['no_response', 'not_interested'];

export async function POST(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const body = await req.json() as { outcome: CRMOutcome };

  if (!VALID_OUTCOMES.includes(body.outcome)) {
    return NextResponse.json({ error: 'outcome must be no_response or not_interested' }, { status: 400 });
  }

  const current = await getOwnedPerson(personId, clerkUserId);
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [updated] = await db
    .update(people)
    .set({ board_status: 'completed', outcome: body.outcome, expires_at: null, updated_at: new Date() })
    .where(eq(people.id, personId))
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: 'stage_changed',
    metadata: matchEventMetadata(
      current,
      { to: 'completed', outcome: body.outcome },
      body.outcome === 'not_interested' ? -3 : -1,
    ),
  });
  if (current.project_id) await refreshProjectMatchProfileFromSignals(current.project_id, null);

  return NextResponse.json(updated);
}
