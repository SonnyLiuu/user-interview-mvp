import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, project_intake } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { jsonRouteError } from '@/lib/api';
import { slugify } from '@/lib/slugify';

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.user_id, userId), eq(projects.is_archived, false)))
      .orderBy(desc(projects.created_at));
    return NextResponse.json(rows);
  } catch (error) {
    return jsonRouteError(error, 'Failed to load projects');
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const { name } = await req.json() as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const slug = slugify(trimmedName);

    const [duplicate] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.user_id, userId), eq(projects.slug, slug)))
      .limit(1);
    if (duplicate) {
      return NextResponse.json({ error: 'You already have a project with this name' }, { status: 409 });
    }

    const [project] = await db
      .insert(projects)
      .values({ user_id: userId, name: trimmedName, slug })
      .returning();

    // Create empty intake row
    await db.insert(project_intake).values({ project_id: project.id });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return jsonRouteError(error, 'Failed to create project');
  }
}
