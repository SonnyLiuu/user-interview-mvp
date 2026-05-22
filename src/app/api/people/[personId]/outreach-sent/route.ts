import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { outreach, people, projects, users, person_events } from '@/lib/db/schema';

type Params = { params: Promise<{ personId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const body = await req.json().catch(() => ({})) as { body?: unknown };
  const sentBody = typeof body.body === 'string' ? body.body.trim() : '';

  const rows = await db
    .select({ person: people, projectSlug: projects.slug, projectId: projects.id })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();
  const [updated] = await db
    .update(people)
    .set({ board_status: 'sent', last_contacted_at: now, expires_at: null, updated_at: now })
    .where(eq(people.id, personId))
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: 'outreach_copied',
    metadata: {},
  });

  let savedOutreach = null;
  if (sentBody) {
    const [currentOutreach] = await db
      .select({ id: outreach.id, content: outreach.content })
      .from(outreach)
      .where(and(eq(outreach.person_id, personId), eq(outreach.is_current, true)))
      .limit(1);

    if (currentOutreach) {
      [savedOutreach] = await db
        .update(outreach)
        .set({ content: { ...(currentOutreach.content ?? {}), body: sentBody } })
        .where(eq(outreach.id, currentOutreach.id))
        .returning({ id: outreach.id, content: outreach.content });
    } else {
      [savedOutreach] = await db
        .insert(outreach)
        .values({ person_id: personId, content: { body: sentBody } })
        .returning({ id: outreach.id, content: outreach.content });
    }
  }

  const projectPath = rows[0].projectSlug ?? rows[0].projectId;
  revalidatePath(`/dashboard/${projectPath}/board`);
  revalidatePath(`/dashboard/${projectPath}/people`);

  return NextResponse.json({ person: updated, outreach: savedOutreach });
}
