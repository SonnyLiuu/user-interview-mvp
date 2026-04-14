import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, project_intake } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.user_id, userId), eq(projects.is_archived, false)))
      .orderBy(desc(projects.created_at));
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const { name } = await req.json() as { name: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const [project] = await db
      .insert(projects)
      .values({ user_id: userId, name: name.trim() })
      .returning();

    // Create empty intake row
    await db.insert(project_intake).values({ project_id: project.id });

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
