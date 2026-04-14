import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, project_intake } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

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

    // Upsert on read — create empty row if none exists
    const [existing] = await db
      .select()
      .from(project_intake)
      .where(eq(project_intake.project_id, projectId))
      .limit(1);

    if (existing) return NextResponse.json(existing);

    const [created] = await db
      .insert(project_intake)
      .values({ project_id: projectId })
      .returning();

    return NextResponse.json(created);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
