import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, project_briefs } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { jsonRouteError } from '@/lib/api';
import { inngest } from '@/inngest/client';

type Params = { params: Promise<{ projectId: string }> };

type BriefStatus = 'not_started' | 'generating' | 'complete' | 'generation_failed';

type BriefResponse = {
  brief: typeof project_briefs.$inferSelect | null;
  status: BriefStatus | string;
};

async function verifyOwnership(userId: string, projectId: string) {
  const [project] = await db
    .select({ id: projects.id, intake_status: projects.intake_status })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
    .limit(1);
  return project ?? null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    const project = await verifyOwnership(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [brief] = await db
      .select()
      .from(project_briefs)
      .where(and(eq(project_briefs.project_id, projectId), eq(project_briefs.is_current, true)))
      .limit(1);

    return NextResponse.json({
      brief: brief ?? null,
      status: project.intake_status ?? 'not_started',
    } satisfies BriefResponse);
  } catch (error) {
    return jsonRouteError(error, 'Failed to load brief');
  }
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    const project = await verifyOwnership(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await db
      .update(projects)
      .set({ intake_status: 'generating', updated_at: new Date() })
      .where(eq(projects.id, projectId));

    await inngest.send({ name: 'brief/generate', data: { projectId } });
    return NextResponse.json({ ok: true, status: 'generating' });
  } catch (error) {
    return jsonRouteError(error, 'Failed to queue brief generation');
  }
}
