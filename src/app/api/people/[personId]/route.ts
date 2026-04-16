import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users } from '@/lib/db/schema';
import { validateInput, updatePersonSchema } from '@/lib/validation';

type Params = { params: Promise<{ personId: string }> };

// Fetch a person, verifying it belongs to the authenticated user.
async function getOwnedPerson(personId: string, clerkUserId: string) {
  const rows = await db
    .select({ person: people })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);
  return rows[0]?.person ?? null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const person = await getOwnedPerson(personId, clerkUserId);
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(person);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const person = await getOwnedPerson(personId, clerkUserId);
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = await req.json();
    const { call_scheduled_at, additional_context: newContext, ...rest } = validateInput(updatePersonSchema, body);

    // Append additional_context rather than replace
    const additionalContext =
      newContext && person.additional_context
        ? [...person.additional_context, ...newContext]
        : (newContext ?? person.additional_context);

    const [updated] = await db
      .update(people)
      .set({
        ...rest,
        additional_context: additionalContext,
        call_scheduled_at: call_scheduled_at ? new Date(call_scheduled_at) : undefined,
        updated_at: new Date(),
      })
      .where(eq(people.id, personId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Validation failed:')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Person update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const person = await getOwnedPerson(personId, clerkUserId);
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.delete(people).where(eq(people.id, personId));
  return new NextResponse(null, { status: 204 });
}
