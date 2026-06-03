import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transcripts, person_events } from '@/lib/db/schema';
import { getOwnedPerson } from '@/lib/person-ownership';

type Params = { params: Promise<{ personId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  if (!await getOwnedPerson(personId, clerkUserId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.person_id, personId))
    .orderBy(desc(transcripts.created_at));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  if (!await getOwnedPerson(personId, clerkUserId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json() as { content: string; type?: 'call' | 'message' };
  if (!body.content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const [created] = await db
    .insert(transcripts)
    .values({ person_id: personId, content: body.content.trim(), type: body.type ?? 'call' })
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: 'transcript_added',
    metadata: { transcript_id: created.id, type: created.type },
  });

  return NextResponse.json(created, { status: 201 });
}
