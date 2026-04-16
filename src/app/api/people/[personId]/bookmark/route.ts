import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users } from '@/lib/db/schema';

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

  const [updated] = await db
    .update(people)
    .set({
      board_status: 'bookmarked',
      expires_at: null,   // person is now permanent — no TTL
      updated_at: new Date(),
    })
    .where(eq(people.id, personId))
    .returning();

  return NextResponse.json(updated);
}
