import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { outreach, people, person_events } from '@/lib/db/schema';
import { shouldClearNoResponseOutcome } from '@/lib/crm';
import { matchEventMetadata, refreshProjectMatchProfileFromSignals } from '@/lib/match-profile';
import { getProjectPathSegment } from '@/lib/projects';
import { getOwnedPersonWithProject } from '@/lib/person-ownership';

type Params = { params: Promise<{ personId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const body = await req.json().catch(() => ({})) as { body?: unknown };
  const sentBody = typeof body.body === 'string' ? body.body.trim() : '';

  const owned = await getOwnedPersonWithProject(personId, clerkUserId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();
  const clearsNoResponse = owned.person.outcome === 'no_response' && shouldClearNoResponseOutcome('sent');
  const [updated] = await db
    .update(people)
    .set({
      board_status: 'sent',
      outcome: clearsNoResponse ? null : owned.person.outcome,
      last_contacted_at: now,
      expires_at: null,
      updated_at: now,
    })
    .where(eq(people.id, personId))
    .returning();

  await db.insert(person_events).values({
    person_id: personId,
    type: 'outreach_copied',
    metadata: matchEventMetadata(
      owned.person,
      clearsNoResponse ? { cleared_outcome: 'no_response' } : {},
      2,
    ),
  });
  if (owned.person.project_id) await refreshProjectMatchProfileFromSignals(owned.person.project_id, null);

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

  const projectPath = getProjectPathSegment(owned.project);
  revalidatePath(`/dashboard/${projectPath}/board`);
  revalidatePath(`/dashboard/${projectPath}/people`);

  return NextResponse.json({ person: updated, outreach: savedOutreach });
}
