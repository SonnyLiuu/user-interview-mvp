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

function discoveryRecommendation(foundation: Foundation) {
  const rawRecommendation = foundation.recommendedOutreachProject;
  const recommendation = rawRecommendation && typeof rawRecommendation === 'object'
    ? rawRecommendation
    : null;
  const label = cleanText(recommendation?.label) || 'Information Discovery';
  const reason = cleanText(recommendation?.reason)
    || 'This is a good first outreach project because it helps turn the startup context into focused learning conversations.';
  return { label, reason };
}

function outreachProjectActionLabel(project?: OutreachProjectRecord) {
  if (!project) return 'Start project';
  if (project.status === 'onboarding' || project.status === 'draft') return 'Continue Setup';
  if (project.status === 'paused') return 'Resume project';
  return 'Open project';
}

function isFullyCreatedInformationDiscoveryProject(project?: OutreachProjectRecord) {
  return Boolean(
    project
    && project.type === 'information_discovery'
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
  const recommendation = discoveryRecommendation(foundation);
  const informationDiscoveryProject = outreachProjects.find((project) => (
    project.type === 'information_discovery' && project.status !== 'archived'
  ));
  const showInformationDiscoveryRecommendation = !isFullyCreatedInformationDiscoveryProject(informationDiscoveryProject);
  const projectActionLabel = outreachProjectActionLabel(informationDiscoveryProject);
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

  if (showInformationDiscoveryRecommendation) {
    alerts.push({
      id: 'recommended-outreach-project',
      eyebrow: 'Recommended first outreach project',
      title: recommendation.label,
      body: recommendation.reason,
      actionLabel: projectActionLabel,
      outreachAction: {
        startupProjectId,
        startupPath,
        type: 'information_discovery',
        projectId: informationDiscoveryProject?.id,
      },
    });
  }

  return <ProjectPageRecommendationBand alerts={alerts} />;
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
          />
        </div>
      </div>
    </FoundationProvider>
  );
}
