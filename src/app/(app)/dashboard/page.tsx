import { redirect } from 'next/navigation';
import { getLatestProject } from '@/lib/backend-server';
import { getProjectPathSegment } from '@/lib/projects';

export default async function DashboardPage() {
  const { project: latest } = await getLatestProject();

  if (latest) {
    redirect(`/dashboard/${getProjectPathSegment(latest)}/foundation`);
  } else {
    redirect('/onboarding');
  }
}
