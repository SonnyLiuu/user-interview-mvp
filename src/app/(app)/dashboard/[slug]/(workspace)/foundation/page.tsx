import { redirect } from 'next/navigation';
import FoundationView from '@/components/brief/FoundationView';
import { FoundationProvider } from '@/components/brief/FoundationContext';
import ProjectChat from '@/components/project/ProjectChat';
import styles from './project-page.module.css';
import { getFoundationView, getProjectBySlugOrId } from '@/lib/backend-server';
import { getProjectPathSegment } from '@/lib/projects';
import { adaptFoundationForMode } from '@/lib/project-modes';

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
  if (!hasFoundation) {
    redirect(`/onboarding/${getProjectPathSegment(project)}`);
  }
  const foundation = adaptFoundationForMode(foundationView.foundation!, project.project_type);

  return (
    <FoundationProvider
      projectId={project.id}
      initialFoundation={foundation}
    >
      <div className={styles.layout}>
        <div className={styles.briefPane}>
          <FoundationView projectId={project.id} initialFoundation={foundation} projectType={project.project_type} />
        </div>
        <div className={styles.chatPane}>
          <ProjectChat
            projectId={project.id}
            initialConversation={foundationView.conversation}
            hasBrief={true}
          />
        </div>
      </div>
    </FoundationProvider>
  );
}
