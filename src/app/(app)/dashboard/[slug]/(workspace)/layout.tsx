import { redirect } from 'next/navigation';
import { AppNav } from '@/components/app-nav/AppNav';
import { WorkspaceTopBar } from '@/components/workspace-top-bar/WorkspaceTopBar';
import { getWorkspaceSummary, listOutreachProjects } from '@/lib/backend-server';
import { requireOwnedProjectBySlug } from '@/lib/project-access';

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { project } = await requireOwnedProjectBySlug(slug);
  const summary = await getWorkspaceSummary(project.id);
  if (!summary) {
    return redirect('/dashboard');
  }
  const { projects: initialProjects } = summary;
  const initialOutreachProjects = project.project_type === 'startup'
    ? await listOutreachProjects(project.id)
    : [];

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: '#faf4ec' }}>
      <AppNav
        slug={slug}
        projectId={project.id}
        projectName={project.name ?? null}
        projectType={project.project_type}
        initialProjects={initialProjects}
      />
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0, height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <WorkspaceTopBar
          slug={slug}
          projectId={project.id}
          projectType={project.project_type}
          initialOutreachProjects={initialOutreachProjects}
        />
        <div key={project.id} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      </main>
    </div>
  );
}
