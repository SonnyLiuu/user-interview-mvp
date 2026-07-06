import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProjectTranscriptInsight } from '@/lib/ai/synthesize-insights';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import { InterviewDetailContent } from '../../../InterviewDetailContent';
import styles from '../../../InsightsPage.module.css';

export const dynamic = 'force-dynamic';

export default async function InterviewInsightPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; source: string; recordId: string }>;
  searchParams?: Promise<{ outreachProjectId?: string | string[] }>;
}) {
  const { slug, source, recordId } = await params;
  const query = await searchParams;
  const requestedOutreachProjectId = Array.isArray(query?.outreachProjectId)
    ? query?.outreachProjectId[0]
    : query?.outreachProjectId;
  if (source !== 'interaction' && source !== 'transcript') notFound();

  const { project } = await requireOwnedProjectBySlug(slug);

  const record = await getProjectTranscriptInsight(project.id, source, recordId, requestedOutreachProjectId);
  if (!record) notFound();
  const backParams = new URLSearchParams();
  if (requestedOutreachProjectId) backParams.set('outreachProjectId', requestedOutreachProjectId);
  const backQuery = backParams.toString();

  return (
    <>
      <nav className={styles.tabBar}>
        <Link href={`/dashboard/${slug}/insights${backQuery ? `?${backQuery}` : ''}`} className={styles.tabPill}>
          Back to insights
        </Link>
        <span className={`${styles.tabPill} ${styles.tabPillActive}`}>
          Interview detail
        </span>
      </nav>
      <main className={styles.page}>
        <div className={styles.shellWide}>
          <InterviewDetailContent record={record} />
        </div>
      </main>
    </>
  );
}
