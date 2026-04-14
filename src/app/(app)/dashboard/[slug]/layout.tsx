import { eq, and } from 'drizzle-orm';
import { AppNav } from '@/components/app-nav/AppNav';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let projectName: string | null = null;
  try {
    const userId = await getAuthenticatedUserId();
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.slug, slug), eq(projects.user_id, userId)))
      .limit(1);
    projectName = project?.name ?? null;
  } catch {
    // unauthenticated — middleware will redirect
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: '#faf4ec' }}>
      <AppNav slug={slug} projectName={projectName} />
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0, height: '100dvh' }}>{children}</main>
    </div>
  );
}
