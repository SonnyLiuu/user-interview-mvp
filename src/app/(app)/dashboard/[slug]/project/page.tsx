import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, project_intake, project_briefs } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { redirect } from 'next/navigation';
import BriefPanel from '@/components/brief/BriefPanel';
import ProjectPageClient from './ProjectPageClient';
import styles from './project-page.module.css';

export default async function ProjectPage({
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

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.user_id, userId)))
    .limit(1);

  if (!project) redirect('/dashboard');

  const [intake] = await db
    .select()
    .from(project_intake)
    .where(eq(project_intake.project_id, project.id))
    .limit(1);

  const [brief] = await db
    .select()
    .from(project_briefs)
    .where(and(eq(project_briefs.project_id, project.id), eq(project_briefs.is_current, true)))
    .limit(1);

  type ConvMsg = { role: 'assistant' | 'user'; content: string };
  const conversation = (intake?.conversation as ConvMsg[] | null) ?? [];

  return (
    <div className={styles.layout}>
      <div className={styles.briefPane}>
        <BriefPanel
          projectId={project.id}
          initialBrief={brief ?? null}
          intakeStatus={project.intake_status ?? 'not_started'}
        />
      </div>
      <div className={styles.chatPane}>
        <ProjectPageClient
          projectId={project.id}
          initialConversation={conversation}
          hasBrief={!!brief}
        />
      </div>
    </div>
  );
}
