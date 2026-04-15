import { redirect } from 'next/navigation';
import { AppNav } from '@/components/app-nav/AppNav';
import { getAuthenticatedUserId } from '@/lib/auth';
import { findOwnedProjectBySlugOrId, listOwnedProjects } from '@/lib/projects';

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const userId = await getAuthenticatedUserId();
  const [project, initialProjects] = await Promise.all([
    findOwnedProjectBySlugOrId(userId, slug),
    listOwnedProjects(userId),
  ]);
  if (!project) {
    return redirect('/dashboard');
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: '#faf4ec' }}>
      <AppNav
        slug={slug}
        projectId={project.id}
        projectName={project.name ?? null}
        initialProjects={initialProjects}
      />
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0, height: '100dvh' }}>{children}</main>
    </div>
  );
}
