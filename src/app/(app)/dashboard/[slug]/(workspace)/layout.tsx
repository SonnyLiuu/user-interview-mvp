import { redirect } from 'next/navigation';
import { AppNav } from '@/components/app-nav/AppNav';
import { getProjectBySlugOrId, getWorkspaceSummary } from '@/lib/backend-server';

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lookup = await getProjectBySlugOrId(slug);
  if (!lookup?.project) {
    return redirect('/dashboard');
  }
  const { project } = lookup;
  const summary = await getWorkspaceSummary(project.id);
  if (!summary) {
    return redirect('/dashboard');
  }
  const { projects: initialProjects } = summary;

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
