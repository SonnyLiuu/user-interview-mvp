import { redirect } from 'next/navigation';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { newProjectOnboardingChatEnabled } from '@/lib/feature-flags';
import { getProjectPathSegment } from '@/lib/projects';
import SetupPageClient from './SetupPageClient';

export default async function ProjectOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;

  if (!project) redirect('/dashboard');

  const pathSegment = getProjectPathSegment(project);
  if (pathSegment !== slug) {
    redirect(`/onboarding/${pathSegment}`);
  }

  if (lookup.foundationExists && project.slug !== null) {
    redirect(`/dashboard/${pathSegment}/foundation`);
  }

  if (!newProjectOnboardingChatEnabled && !lookup.foundationExists && project.slug !== null) {
    redirect(`/dashboard/${pathSegment}/people`);
  }

  return (
    <SetupPageClient
      projectId={project.id}
      projectSlug={pathSegment}
      projectType={project.project_type}
      initialStage={lookup.foundationExists || !newProjectOnboardingChatEnabled ? 'name' : 'chat'}
      hasFoundation={lookup.foundationExists}
    />
  );
}
