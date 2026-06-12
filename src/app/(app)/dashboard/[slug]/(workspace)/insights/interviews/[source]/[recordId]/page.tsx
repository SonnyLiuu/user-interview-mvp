import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { getProjectTranscriptInsight } from '@/lib/ai/synthesize-insights';
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

  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;
  if (!project) redirect('/dashboard');

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
