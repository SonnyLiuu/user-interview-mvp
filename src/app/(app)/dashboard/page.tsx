import { redirect } from 'next/navigation';
import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();

  const [latest] = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(and(eq(projects.user_id, userId), eq(projects.is_archived, false)))
    .orderBy(desc(projects.created_at))
    .limit(1);

  if (latest) {
    redirect(`/dashboard/${latest.slug ?? latest.id}/people`);
  } else {
    redirect('/onboarding');
  }
}