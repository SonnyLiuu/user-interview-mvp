import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;
    const project = await getOwnedProject(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as { name?: string; is_archived?: boolean };
    const updates: Partial<typeof project> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_archived !== undefined) updates.is_archived = body.is_archived;

    const [updated] = await db
      .update(projects)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
