import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { project_foundations } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { findOwnedProjectBySlugOrId, getProjectPathSegment } from '@/lib/projects';
import SetupPageClient from './SetupPageClient';

export default async function ProjectOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let userId: string;
  try {
    userId = await getAuthenticatedUserId();
  } catch {
    redirect('/login');
  }

  const project = await findOwnedProjectBySlugOrId(userId, slug);

  if (!project) redirect('/dashboard');

  const pathSegment = getProjectPathSegment(project);
  if (pathSegment !== slug) {
    redirect(`/onboarding/${pathSegment}`);
  }

  // If a foundation already exists, skip onboarding
  const [foundation] = await db
    .select({ id: project_foundations.id })
    .from(project_foundations)
    .where(eq(project_foundations.project_id, project.id))
    .limit(1);

  if (foundation) {
    redirect(`/dashboard/${pathSegment}/foundation`);
  }

  return (
    <SetupPageClient
      projectId={project.id}
      projectSlug={pathSegment}
    />
  );
}
