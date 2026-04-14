import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, project_briefs } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { inngest } from '@/inngest/client';

type Params = { params: Promise<{ projectId: string }> };

async function verifyOwnership(userId: string, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
    .limit(1);
  return project ?? null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    if (!await verifyOwnership(userId, projectId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [brief] = await db
      .select()
      .from(project_briefs)
      .where(and(eq(project_briefs.project_id, projectId), eq(project_briefs.is_current, true)))
      .limit(1);

    return NextResponse.json(brief ?? null);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    if (!await verifyOwnership(userId, projectId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await inngest.send({ name: 'brief/generate', data: { projectId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
