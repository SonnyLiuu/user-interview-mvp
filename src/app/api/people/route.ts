import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { auth } from '@clerk/nextjs/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { outreach_projects, people, projects, users } from '@/lib/db/schema';
import { validateInput, createPersonSchema } from '@/lib/validation';

// Derive a human-readable placeholder name while the research runs.
function placeholderName(url?: string, pastedText?: string): string {
  if (!url && pastedText?.trim()) {
    return 'Pasted profile';
  }

  try {
    if (!url) return 'Discovering...';
    const { hostname, pathname } = new URL(url);
    const slug = pathname.replace(/\//g, ' ').trim();
    return slug || hostname;
  } catch {
    return 'Discovering...';
  }
}

export async function GET(req: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 100);
  const projectId = req.nextUrl.searchParams.get('projectId')?.trim();

  if (ids.length === 0 || !projectId) {
    return NextResponse.json([]);
  }

  const rows = await db
    .select({ person: people })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(
      inArray(people.id, ids),
      eq(people.project_id, projectId),
      eq(users.clerk_user_id, clerkUserId),
    ));

  return NextResponse.json(rows.map((row) => row.person));
}

export async function POST(req: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = validateInput(createPersonSchema, body);

    // Verify the project belongs to this user
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerk_user_id, clerkUserId));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [project] = await db
      .select({ id: projects.id, slug: projects.slug })
      .from(projects)
      .where(and(eq(projects.id, data.project_id), eq(projects.user_id, user.id)))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (data.outreach_project_id) {
      const [outreachProject] = await db
        .select({ id: outreach_projects.id })
        .from(outreach_projects)
        .where(and(
          eq(outreach_projects.id, data.outreach_project_id),
          eq(outreach_projects.startup_project_id, data.project_id),
        ))
        .limit(1);

      if (!outreachProject) {
        return NextResponse.json({ error: 'Outreach project not found' }, { status: 404 });
      }
    }

    const [person] = await db
      .insert(people)
      .values({
        project_id: data.project_id,
        outreach_project_id: data.outreach_project_id,
        name: data.name ?? placeholderName(data.source_urls[0], data.raw_pasted_text),
        title: data.title,
        company: data.company,
        persona_type: data.persona_type,
        source_urls: data.source_urls,
        raw_pasted_text: data.raw_pasted_text?.trim() || undefined,
        additional_context: data.additional_context,
        research_depth: data.research_depth,
        crawl_status: 'pending',
        analysis_status: 'pending',
        expires_at: null,
      })
      .returning();

    const projectPath = project.slug ?? project.id;
    revalidatePath(`/dashboard/${projectPath}/people`);
    revalidatePath(`/dashboard/${projectPath}/board`);

    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Validation failed:')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Person creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
