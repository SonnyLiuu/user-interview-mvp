import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users, person_events } from '@/lib/db/schema';
import { matchEventMetadata, refreshProjectMatchProfileFromSignals } from '@/lib/match-profile';

type Params = { params: Promise<{ personId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;

  const rows = await db
    .select({ person: people })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const current = rows[0].person;
  const nextBoardStatus =
    current.board_status === 'bookmarked'
      ? null
      : current.board_status ?? 'bookmarked';

  const [updated] = await db
    .update(people)
    .set({
      board_status: nextBoardStatus,
      expires_at: null,
      updated_at: new Date(),
    })
    .where(eq(people.id, personId))
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: nextBoardStatus ? 'bookmarked' : 'unbookmarked',
    metadata: matchEventMetadata(current, { to: nextBoardStatus }, nextBoardStatus ? 1 : -0.5),
  });
  if (current.project_id) await refreshProjectMatchProfileFromSignals(current.project_id, null);

  return NextResponse.json(updated);
}
