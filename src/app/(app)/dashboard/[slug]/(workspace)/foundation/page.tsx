import { redirect } from 'next/navigation';
import BriefPanel from '@/components/brief/BriefPanel';
import FoundationView from '@/components/brief/FoundationView';
import { FoundationProvider } from '@/components/brief/FoundationContext';
import ProjectPageClient from './ProjectPageClient';
import styles from './project-page.module.css';
import { getFoundationView, getProjectBySlugOrId } from '@/lib/backend-server';
import { getProjectPathSegment } from '@/lib/projects';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;

  if (!project) redirect('/dashboard');

  if (project.slug && project.slug !== slug) {
    redirect(`/dashboard/${getProjectPathSegment(project)}/foundation`);
  }

  const foundationView = await getFoundationView(project.id);
  if (!foundationView) {
    redirect('/dashboard');
  }

  const hasFoundation = foundationView.foundation !== null;

  return (
    <FoundationProvider
      projectId={project.id}
      initialFoundation={foundationView.foundation ?? { summary: '', targetUser: '', painPoint: '', valueProp: '', idealPeopleTypes: [] }}
    >
      <div className={styles.layout}>
        <div className={styles.briefPane}>
          {hasFoundation ? (
            <FoundationView projectId={project.id} initialFoundation={foundationView.foundation!} />
          ) : (
            <BriefPanel
              projectId={project.id}
              initialBrief={foundationView.brief}
              intakeStatus={foundationView.intakeStatus}
            />
          )}
        </div>
        <div className={styles.chatPane}>
          <ProjectPageClient
            projectId={project.id}
            initialConversation={foundationView.conversation}
            hasBrief={hasFoundation || !!foundationView.brief}
          />
        </div>
      </div>
    </FoundationProvider>
  );
}
