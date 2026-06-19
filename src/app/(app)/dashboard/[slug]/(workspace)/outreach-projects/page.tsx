import { redirect } from 'next/navigation';
import { getProjectBySlugOrId, listOutreachProjects } from '@/lib/backend-server';
import { outreachProjectOnboardingChatEnabled } from '@/lib/feature-flags';
import { getProjectPathSegment } from '@/lib/projects';
import OutreachProjectsClient from './OutreachProjectsClient';

export const dynamic = 'force-dynamic';

export default async function OutreachProjectsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;

  if (!project) redirect('/dashboard');
  if (project.project_type !== 'startup') redirect(`/dashboard/${getProjectPathSegment(project)}/foundation`);

  const pathSegment = getProjectPathSegment(project);
  if (pathSegment !== slug) redirect(`/dashboard/${pathSegment}/outreach-projects`);

  const outreachProjects = await listOutreachProjects(project.id);

  return (
    <OutreachProjectsClient
      startupProjectId={project.id}
      startupPath={pathSegment}
      initialOutreachProjects={outreachProjects}
      onboardingChatEnabled={outreachProjectOnboardingChatEnabled}
    />
  );
}
