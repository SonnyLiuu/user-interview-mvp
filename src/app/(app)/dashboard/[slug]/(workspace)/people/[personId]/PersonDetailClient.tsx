'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Person, PersonAnalysis } from '@/lib/db/schema';
import { PersonaBubble } from '@/components/people/PersonaBubble';
import type { PersonaType } from '@/components/people/PersonaBubble';
import { RelevanceIndicator } from '@/components/people/RelevanceIndicator';
import { BookmarkButton } from '@/components/people/BookmarkButton';
import { UrlInputForm } from '@/components/people/UrlInputForm';
import styles from './PersonDetailClient.module.css';

type Props = {
  person: Person;
  slug: string;
};

export function PersonDetailClient({ person: initialPerson, slug }: Props) {
  const router = useRouter();
  const [person, setPerson] = useState<Person>(initialPerson);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [showContextForm, setShowContextForm] = useState(false);
  const [recrawling, setRecrawling] = useState(false);

  const analysis = person.analysis as PersonAnalysis | null;
  const contact = analysis?.contact_info;

  async function handleBookmarkToggle() {
    setBookmarkLoading(true);
    try {
      const res = await fetch(`/api/people/${person.id}/bookmark`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json() as Person;
        setPerson(updated);
      }
    } finally {
      setBookmarkLoading(false);
    }
  }

  async function handleAddContext(urls: string[]) {
    setRecrawling(true);
    setShowContextForm(false);
    try {
      // Append the new URLs to additional_context and re-trigger crawl
      await fetch(`/api/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_context: urls }),
      });

      // Also append the URLs to source_urls so the crawl picks them up
      const currentUrls = person.source_urls ?? [];
      const mergedUrls = [...new Set([...currentUrls, ...urls])];
      await fetch(`/api/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_urls: mergedUrls }),
      });

      const crawlRes = await fetch(`/api/people/${person.id}/crawl`, { method: 'POST' });
      if (crawlRes.ok) {
        // Optimistically reflect the crawling state
        setPerson((p) => ({ ...p, crawl_status: 'crawling', analysis_status: 'analyzing' }));
        // Poll until complete
        const poll = setInterval(async () => {
          const r = await fetch(`/api/people/${person.id}`);
          if (!r.ok) return;
          const updated = await r.json() as Person;
          setPerson(updated);
          if (updated.analysis_status === 'complete' || updated.crawl_status === 'error') {
            clearInterval(poll);
            setRecrawling(false);
          }
        }, 3000);
      }
    } catch {
      setRecrawling(false);
    }
  }

  const isAnalyzing = recrawling || person.crawl_status === 'crawling' || person.analysis_status === 'analyzing';

  return (
    <div className={styles.page}>
      {/* Back navigation */}
      <button
        type="button"
        className={styles.backBtn}
        onClick={() => router.push(`/dashboard/${slug}/people`)}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.backIcon}>
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      <div className={styles.content}>
        {/* ── Identity header ─────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerIdentity}>
              <h1 className={styles.name}>{person.name}</h1>
              {(person.title || person.company) && (
                <p className={styles.role}>
                  {[person.title, person.company].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className={styles.headerMeta}>
                {person.persona_type && (
                  <PersonaBubble type={person.persona_type as PersonaType} />
                )}
                {person.relevance_rank && (
                  <RelevanceIndicator rank={person.relevance_rank as 'low' | 'medium' | 'high'} />
                )}
              </div>
            </div>
            <div className={styles.headerActions}>
              <BookmarkButton
                bookmarked={person.board_status === 'bookmarked'}
                onToggle={handleBookmarkToggle}
                loading={bookmarkLoading}
              />
            </div>
          </div>

          {/* Why they matter — prominent */}
          {analysis?.why_they_matter && (
            <p className={styles.whyMatter}>{analysis.why_they_matter}</p>
          )}

          {isAnalyzing && (
            <p className={styles.analyzingNote} role="status">Re-analyzing with updated context…</p>
          )}
        </div>

        <div className={styles.body}>
          {/* ── Summary ─────────────────────────────────────────────────── */}
          {analysis?.summary && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Summary</h2>
              <p className={styles.prose}>{analysis.summary}</p>
            </section>
          )}

          {/* ── Key insights ────────────────────────────────────────────── */}
          {analysis?.key_insights?.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Key insights</h2>
              <ul className={styles.list}>
                {analysis.key_insights.map((insight, i) => (
                  <li key={i} className={styles.listItem}>{insight}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── Suggested questions ─────────────────────────────────────── */}
          {analysis?.recommended_questions?.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Questions to ask</h2>
              <ol className={styles.questionList}>
                {analysis.recommended_questions.map((q, i) => (
                  <li key={i} className={styles.question}>{q}</li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* ── Risk factors ────────────────────────────────────────────── */}
          {analysis?.risk_factors?.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Reasons to be cautious</h2>
              <ul className={styles.list}>
                {analysis.risk_factors.map((r, i) => (
                  <li key={i} className={styles.listItem}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── Contact info ────────────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Contact</h2>
            {contact && Object.values(contact).some(Boolean) ? (
              <dl className={styles.contactGrid}>
                {contact.email && <><dt className={styles.contactKey}>Email</dt><dd className={styles.contactVal}>{contact.email}</dd></>}
                {contact.linkedin && <><dt className={styles.contactKey}>LinkedIn</dt><dd className={styles.contactVal}><a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>{contact.linkedin}</a></dd></>}
                {contact.twitter && <><dt className={styles.contactKey}>Twitter</dt><dd className={styles.contactVal}>{contact.twitter}</dd></>}
                {contact.website && <><dt className={styles.contactKey}>Website</dt><dd className={styles.contactVal}><a href={contact.website} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>{contact.website}</a></dd></>}
              </dl>
            ) : (
              <p className={styles.notFound}>Contact information not found in crawled content.</p>
            )}
          </section>

          {/* ── Source URLs ─────────────────────────────────────────────── */}
          {person.source_urls?.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Sources crawled</h2>
              <ul className={styles.sourceList}>
                {person.source_urls.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── Add more context ────────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Add more context</h2>
            <p className={styles.contextHint}>
              Paste additional URLs to deepen the analysis. The profile will be re-researched with the new sources.
            </p>
            {showContextForm ? (
              <UrlInputForm
                onSubmit={handleAddContext}
                onCancel={() => setShowContextForm(false)}
                submitLabel="Update analysis"
              />
            ) : (
              <button
                type="button"
                className={styles.addContextBtn}
                onClick={() => setShowContextForm(true)}
                disabled={isAnalyzing}
              >
                + Add URLs
              </button>
            )}
          </section>

          {/* ── Outreach placeholder ────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Outreach</h2>
            <div className={styles.outreachStub}>
              <p className={styles.stubText}>
                Outreach generation — coming in the next phase.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
