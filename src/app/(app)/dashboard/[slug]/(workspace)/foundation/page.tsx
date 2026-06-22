import { redirect } from 'next/navigation';
import FoundationView from '@/components/brief/FoundationView';
import { FoundationProvider } from '@/components/brief/FoundationContext';
import ProjectChat from '@/components/project/ProjectChat';
import type { Foundation, OutreachProjectRecord } from '@/lib/backend-types';
import styles from './project-page.module.css';
import ProjectPageRecommendationBand, { type RecommendationBandAlert } from './ProjectPageRecommendationBand';
import { getFoundationView, getProjectBySlugOrId, listOutreachProjects } from '@/lib/backend-server';
import { getProjectPathSegment } from '@/lib/projects';
import { adaptFoundationForMode } from '@/lib/project-modes';

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function ideaValidationRecommendation(foundation: Foundation) {
  const rawRecommendation = foundation.recommendedOutreachProject;
  const recommendation = rawRecommendation && typeof rawRecommendation === 'object'
    ? rawRecommendation
    : null;
  const label = cleanText(recommendation?.label) || 'Idea Validation';
  const reason = cleanText(recommendation?.reason)
    || 'This is a good first outreach project because it helps turn the startup context into focused learning conversations.';
  return { label, reason };
}

function isFullyCreatedIdeaValidationProject(project?: OutreachProjectRecord) {
  return Boolean(
    project
    && project.type === 'idea_validation'
    && project.status !== 'archived'
    && project.brief_json,
  );
}

function StartupRecommendationPanel({
  foundation,
  outreachProjects,
  startupPath,
  startupProjectId,
}: {
  foundation: Foundation;
  outreachProjects: OutreachProjectRecord[];
  startupPath: string;
  startupProjectId: string;
}) {
  const recommendation = ideaValidationRecommendation(foundation);
  const ideaValidationProject = outreachProjects.find((project) => (
    project.type === 'idea_validation' && project.status !== 'archived'
  ));
  const readyIdeaValidationProject = isFullyCreatedIdeaValidationProject(ideaValidationProject)
    ? ideaValidationProject
    : null;
  const showIdeaValidationRecommendation = !isFullyCreatedIdeaValidationProject(ideaValidationProject);
  const alerts: RecommendationBandAlert[] = [
    {
      id: 'ongoing-advisor-first-run',
      eyebrow: 'Foundation advisor',
      title: 'Let the advisor sharpen your foundation',
      body: 'New here? Ask the Ongoing Advisor to add more detail to your startup foundation. It can suggest changes, make edits for you, and help pressure-test weak spots before you start outreach.',
      actionLabel: 'Try the advisor',
      actionTargetId: 'ongoing-advisor-input',
      actionEventName: 'foundation-advisor:try',
    },
  ];

  if (showIdeaValidationRecommendation) {
    alerts.push({
      id: 'recommended-outreach-project',
      eyebrow: 'Research your first people',
      title: recommendation.label,
      body: recommendation.reason,
      actionLabel: 'Create an Idea Validation project',
      actionHref: `/dashboard/${startupPath}/outreach-projects`,
    });
  }

  if (readyIdeaValidationProject) {
    alerts.push({
      id: 'first-outreach-project-ready',
      eyebrow: 'First outreach project ready',
      title: 'Your Idea Validation project is ready',
      body: 'Start by researching the first people you might want to contact.',
      actionLabel: 'Research people',
      actionHref: `/dashboard/${startupPath}/people?outreachProjectId=${encodeURIComponent(readyIdeaValidationProject.id)}`,
    });
  }

  return <ProjectPageRecommendationBand alerts={alerts} storageScope={startupProjectId} />;
}

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
  const pathSegment = getProjectPathSegment(project);
  const outreachProjects = project.project_type === 'startup'
    ? await listOutreachProjects(project.id)
    : [];

  return (
    <FoundationProvider
      projectId={project.id}
      initialFoundation={foundation}
    >
      <div className={styles.layout}>
        <div className={styles.briefPane}>
          {project.project_type === 'startup' && (
            <StartupRecommendationPanel
              foundation={foundation}
              outreachProjects={outreachProjects}
              startupPath={pathSegment}
              startupProjectId={project.id}
            />
          )}
          <div className={styles.foundationArea}>
            <FoundationView projectId={project.id} initialFoundation={foundation} projectType={project.project_type} />
          </div>
        </div>
        <div className={styles.chatPane}>
          <ProjectChat
            projectId={project.id}
            initialConversation={foundationView.conversation}
            hasBrief={true}
            inputId="ongoing-advisor-input"
            advisorIntroEventName="foundation-advisor:try"
            advisorAlertId="ongoing-advisor-first-run"
            collapsible
          />
        </div>
      </div>
    </FoundationProvider>
  );
}
