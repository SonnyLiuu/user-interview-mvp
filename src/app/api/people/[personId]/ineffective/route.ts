import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users, person_events } from '@/lib/db/schema';
import type { CRMOutcome } from '@/lib/crm';

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

  const rows = await db
    .select({ person: people })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [updated] = await db
    .update(people)
    .set({ board_status: 'completed', outcome: body.outcome, updated_at: new Date() })
    .where(eq(people.id, personId))
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: 'stage_changed',
    metadata: { to: 'completed', outcome: body.outcome },
  });

  return NextResponse.json(updated);
}
