import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProjectTranscriptInsight } from '@/lib/ai/synthesize-insights';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import { InterviewDetailContent } from '../../../InterviewDetailContent';
import styles from '../../../InsightsPage.module.css';

export const dynamic = 'force-dynamic';

export default async function InterviewInsightPage({
  params,
}: {
  params: Promise<{ slug: string; source: string; recordId: string }>;
}) {
  const { slug, source, recordId } = await params;
  if (source !== 'interaction' && source !== 'transcript') notFound();

  const { project } = await requireOwnedProjectBySlug(slug);

  const record = await getProjectTranscriptInsight(project.id, source, recordId);
  if (!record) notFound();

  return (
    <>
      <nav className={styles.tabBar}>
        <Link href={`/dashboard/${slug}/insights`} className={styles.tabPill}>
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
