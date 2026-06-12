import { redirect } from 'next/navigation';
import { getOutreachProject, getProjectBySlugOrId } from '@/lib/backend-server';
import { getProjectPathSegment } from '@/lib/projects';
import IdeaValidationOnboardingClient from './IdeaValidationOnboardingClient';

export const dynamic = 'force-dynamic';

export default async function IdeaValidationOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string; outreachProjectId: string }>;
}) {
  const { slug, outreachProjectId } = await params;
  const lookup = await getProjectBySlugOrId(slug);
  const startup = lookup?.project;
  if (!startup) redirect('/dashboard');
  if (startup.project_type !== 'startup') redirect(`/dashboard/${getProjectPathSegment(startup)}/foundation`);

  const startupPath = getProjectPathSegment(startup);
  if (startupPath !== slug) {
    redirect(`/dashboard/${startupPath}/outreach-projects/${outreachProjectId}/onboarding`);
  }

  const outreachProject = await getOutreachProject(outreachProjectId);
  if (!outreachProject || outreachProject.startup_project_id !== startup.id) {
    redirect(`/dashboard/${startupPath}/foundation`);
  }
  if (outreachProject.type !== 'idea_validation') {
    redirect(`/dashboard/${startupPath}/foundation`);
  }

  return (
    <IdeaValidationOnboardingClient
      outreachProjectId={outreachProject.id}
      startupPath={startupPath}
      initialStatus={outreachProject.status}
    />
  );
}
