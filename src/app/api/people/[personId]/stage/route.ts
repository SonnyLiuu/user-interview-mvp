import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { people, person_events } from '@/lib/db/schema';
import { CRM_STAGE_IDS, shouldClearNoResponseOutcome, stageToBoardStatus } from '@/lib/crm';
import { matchEventMetadata, refreshProjectMatchProfileFromSignals } from '@/lib/match-profile';
import { getOwnedPerson } from '@/lib/person-ownership';

type Params = { params: Promise<{ personId: string }> };
const stageBodySchema = z.object({ stage: z.enum(CRM_STAGE_IDS) });

export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const parsed = stageBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  const { stage } = parsed.data;

  const current = await getOwnedPerson(personId, clerkUserId);
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const clearsNoResponse = current.outcome === 'no_response' && shouldClearNoResponseOutcome(stage);
  const eventMetadata = {
    from: current.board_status,
    to: stage,
    ...(clearsNoResponse ? { cleared_outcome: 'no_response' } : {}),
  };
  const [updated] = await db
    .update(people)
    .set({
      board_status: stageToBoardStatus(stage),
      outcome: clearsNoResponse ? null : current.outcome,
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
      eventMetadata,
      stage === 'sent' ? 2 : stage === 'scheduled' ? 3 : stage === 'completed' ? 4 : 1,
    ),
  });
  if (current.project_id) await refreshProjectMatchProfileFromSignals(current.project_id, null);

  return NextResponse.json(updated);
}
