import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, person_events } from '@/lib/db/schema';
import { matchEventMetadata, refreshProjectMatchProfileFromSignals } from '@/lib/match-profile';
import { getOwnedPerson } from '@/lib/person-ownership';

type Params = { params: Promise<{ personId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;

  const current = await getOwnedPerson(personId, clerkUserId);
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Only toggle between null and 'bookmarked'.
  // If the person is already in a pipeline stage (sent/scheduled/completed),
  // leave their board_status alone — the bookmark button is a no-op in that case.
  const nextBoardStatus =
    current.board_status === 'bookmarked'
      ? null
      : current.board_status
        ? current.board_status // sent / scheduled / completed — don't touch
        : 'bookmarked'; // null → bookmarked

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
