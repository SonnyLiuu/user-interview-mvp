import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { people, projects, users, person_events } from '@/lib/db/schema';
import { CRM_STAGE_IDS, stageToBoardStatus } from '@/lib/crm';

type Params = { params: Promise<{ personId: string }> };
const stageBodySchema = z.object({ stage: z.enum(CRM_STAGE_IDS) });

export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const parsed = stageBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  const { stage } = parsed.data;

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
    .set({ board_status: stageToBoardStatus(stage), updated_at: new Date() })
    .where(eq(people.id, personId))
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: 'stage_changed',
    metadata: { from: rows[0].person.board_status, to: stage },
  });

  return NextResponse.json(updated);
}
