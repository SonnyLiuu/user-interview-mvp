export function getProjectPathSegment(project: Pick<{ id: string; slug: string | null }, 'id' | 'slug'>): string {
  return project.slug ?? project.id;
}
