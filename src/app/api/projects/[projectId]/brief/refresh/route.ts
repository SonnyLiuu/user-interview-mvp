import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { inngest } from '@/inngest/client';

type Params = { params: Promise<{ projectId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    const { projectId } = await params;

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
      .limit(1);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await inngest.send({ name: 'brief/generate', data: { projectId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
