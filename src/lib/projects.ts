import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, type Project } from '@/lib/db/schema';

export type ProjectNavItem = Pick<Project, 'id' | 'name' | 'slug'>;

export async function findOwnedProjectBySlugOrId(userId: string, slugOrId: string): Promise<Project | null> {
  const [bySlug] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.user_id, userId), eq(projects.slug, slugOrId)))
    .limit(1);

  if (bySlug) return bySlug;

  const [byId] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.user_id, userId), eq(projects.id, slugOrId)))
    .limit(1);

  return byId ?? null;
}

export async function listOwnedProjects(userId: string): Promise<ProjectNavItem[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
    })
    .from(projects)
    .where(and(eq(projects.user_id, userId), eq(projects.is_archived, false)))
    .orderBy(desc(projects.created_at));
}

export function getProjectPathSegment(project: Pick<Project, 'id' | 'slug'>): string {
  return project.slug ?? project.id;
}
