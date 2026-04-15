import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { jsonRouteError } from '@/lib/api';

type Params = { params: Promise<{ projectId: string }> };

async function getOwnedProject(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
    .limit(1);
  return project ?? null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    const project = await getOwnedProject(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(project);
  } catch (error) {
    return jsonRouteError(error, 'Failed to load project');
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    const project = await getOwnedProject(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as { name?: string; is_archived?: boolean; slug?: string };
    if (body.slug !== undefined) {
      return NextResponse.json({ error: 'Project slugs are immutable' }, { status: 400 });
    }

    const updates: Partial<typeof project> = {};
    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      updates.name = trimmedName;
    }
    if (body.is_archived !== undefined) updates.is_archived = body.is_archived;

    const [updated] = await db
      .update(projects)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    return jsonRouteError(error, 'Failed to update project');
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    const project = await getOwnedProject(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db
      .update(projects)
      .set({ is_archived: true, updated_at: new Date() })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonRouteError(error, 'Failed to archive project');
  }
}
