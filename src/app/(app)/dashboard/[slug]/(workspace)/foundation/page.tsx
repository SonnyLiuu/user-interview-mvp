import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { project_intake, project_briefs, project_foundations } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { redirect } from 'next/navigation';
import BriefPanel from '@/components/brief/BriefPanel';
import FoundationView, { type Foundation } from '@/components/brief/FoundationView';
import ProjectPageClient from './ProjectPageClient';
import styles from './project-page.module.css';
import { findOwnedProjectBySlugOrId, getProjectPathSegment } from '@/lib/projects';

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

  const project = await findOwnedProjectBySlugOrId(userId, slug);

  if (!project) redirect('/dashboard');

  if (project.slug && project.slug !== slug) {
    redirect(`/dashboard/${getProjectPathSegment(project)}/foundation`);
  }

  // Check for new-style foundation first
  const [foundationRow] = await db
    .select()
    .from(project_foundations)
    .where(eq(project_foundations.project_id, project.id))
    .orderBy(desc(project_foundations.generated_at))
    .limit(1);

  if (foundationRow?.foundation_json) {
    const foundation = foundationRow.foundation_json as Foundation;
    return (
      <div className={styles.briefPane} style={{ borderRight: 'none' }}>
        <FoundationView foundation={foundation} />
      </div>
    );
  }

  // Fall back to old brief + chat layout
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
