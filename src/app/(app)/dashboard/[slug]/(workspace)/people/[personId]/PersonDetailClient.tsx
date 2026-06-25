'use client';

import { Fragment, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Person, PersonAnalysis, Transcript, CallPrepContent } from '@/lib/db/schema';
import type { ProjectType } from '@/lib/backend-types';
import { getProjectModeConfig } from '@/lib/project-modes';
import { derivePersonSources, discoveredSourceLabel, normalizeUrlKey } from '@/lib/person-sources';
import { PersonaBubble } from '@/components/people/PersonaBubble';
import { getPersonaTags, type PersonaTagMode } from '@/components/people/persona-tags';
import { BookmarkButton } from '@/components/people/BookmarkButton';
import { UrlInputForm } from '@/components/people/UrlInputForm';
import { boardStatusToStage } from '@/lib/crm';
import { CallBriefSection } from './PersonCallBriefSection';
import { OutreachComposer, type OutreachRow } from './PersonOutreachComposer';
import { StageActions, StageBreadcrumb } from './PersonStageActions';
import { TranscriptSection } from './PersonTranscriptSection';
import styles from './PersonDetailClient.module.css';

type Props = {
  person: Person;
  slug: string;
  projectType: ProjectType;
  tagMode: PersonaTagMode;
  initialOutreach: OutreachRow | null;
  initialCallPrep: { id: string; content: CallPrepContent | null } | null;
  initialTranscripts: Transcript[];
};

const MATCH_FACTOR_LABELS: Record<string, string> = {
  recipient_fit: 'Recipient fit',
  topic_overlap: 'Topic overlap',
  shared_context: 'Shared context',
  desired_response_usefulness: 'Response usefulness',
  personalization_quality: 'Personalization',
  evidence_confidence: 'Evidence confidence',
};

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function normalizedScore(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function rankForScore(score: number | null) {
  if (score === null) return null;
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function fitPresentation(rank: string | null | undefined, projectType: ProjectType) {
  if (rank === 'high') {
    return {
      badge: 'Strong fit',
      headline: projectType === 'networking'
        ? 'A high-priority outreach opportunity'
        : 'A high-leverage learning conversation',
    };
  }
  if (rank === 'medium') {
    return {
      badge: 'Moderate fit',
      headline: projectType === 'networking'
        ? 'A promising outreach opportunity'
        : 'A promising conversation with some gaps',
    };
  }
  return {
    badge: 'Low fit',
    headline: projectType === 'networking'
      ? 'A lower-priority outreach opportunity'
      : 'A lower-priority learning conversation',
  };
}

function MatchGauge({ score, pending }: { score: number | null; pending: boolean }) {
  const label = pending
    ? 'Match score is refreshing'
    : score === null
      ? 'Match score unavailable'
      : `${score} out of 100 match score`;

  return (
    <div className={styles.matchGauge} role="img" aria-label={label}>
      <svg viewBox="0 0 104 62" aria-hidden="true">
        <path className={styles.gaugeTrack} d="M8 54a44 44 0 0 1 88 0" pathLength="100" />
        {score !== null && (
          <path
            className={styles.gaugeFill}
            d="M8 54a44 44 0 0 1 88 0"
            pathLength="100"
            strokeDasharray={`${score} 100`}
          />
        )}
      </svg>
      <div className={styles.gaugeValue}>
        <strong>{pending ? '…' : score ?? '—'}</strong>
        <span>{pending ? 'Refreshing' : score === null ? 'Not scored' : 'Match'}</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PersonDetailClient({ person: initialPerson, slug, projectType, tagMode, initialOutreach, initialCallPrep, initialTranscripts }: Props) {
  const router = useRouter();
  const [person, setPerson] = useState<Person>(initialPerson);
  const [savedOutreach, setSavedOutreach] = useState(initialOutreach);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [showContextForm, setShowContextForm] = useState(false);
  const [recrawling, setRecrawling] = useState(false);
  const [copyingOutreach, setCopyingOutreach] = useState(false);
  const rescoreTriggered = useRef(false);

  const analysis = person.analysis as PersonAnalysis | null;
  const modeConfig = getProjectModeConfig(projectType);
  const sources = derivePersonSources(person, analysis);
  const knownSourceKeys = new Set(
    [sources.linkedin, sources.twitter, sources.website, ...(person.source_urls ?? [])]
      .filter((url): url is string => !!url)
      .map(normalizeUrlKey),
  );
  const discoveredSources = (person.discovered_urls ?? []).filter((source) => !knownSourceKeys.has(normalizeUrlKey(source.url)));
  const hasAnySource =
    !!sources.email ||
    !!sources.linkedin ||
    !!sources.twitter ||
    !!sources.website ||
    sources.linkedinPastedNoUrl ||
    discoveredSources.length > 0;
  const stage = boardStatusToStage(person.board_status);
  const matchFactors = person.match_factors ?? analysis?.match_factors ?? null;
  const matchExplanation = person.match_explanation ?? analysis?.match_explanation ?? null;
  const hasMatchStatus = person.match_status === 'pending' || person.match_status === 'stale';
  const personaTags = getPersonaTags(person.persona_type, analysis?.global_tags, tagMode);
  const matchScore = normalizedScore(person.match_score ?? analysis?.match_score);
  const storedMatchRank = person.match_rank ?? analysis?.match_rank ?? person.relevance_rank ?? analysis?.relevance_rank;
  const matchRank = storedMatchRank === 'high' || storedMatchRank === 'medium' || storedMatchRank === 'low'
    ? storedMatchRank
    : rankForScore(matchScore);
  const fit = fitPresentation(matchRank, projectType);
  const evidencePreview = analysis?.key_insights?.slice(0, 2) ?? [];
  const questionsPreview = analysis?.recommended_questions?.slice(0, 2) ?? [];
  const sourceLinks = [
    sources.linkedin ? { label: 'LinkedIn', url: sources.linkedin } : null,
    sources.twitter ? { label: 'Twitter / X', url: sources.twitter } : null,
    sources.website ? { label: 'Personal site', url: sources.website } : null,
    ...discoveredSources.map((source) => ({ label: discoveredSourceLabel(source), url: source.url })),
  ].filter((source): source is { label: string; url: string } => source !== null);
  const sourceCount = sourceLinks.length + (sources.email ? 1 : 0) + (sources.linkedinPastedNoUrl ? 1 : 0);
  const showFitCard =
    (projectType === 'networking' || !!person.match_profile_version || person.match_status === 'pending')
    && (!!matchExplanation || !!matchFactors || hasMatchStatus || matchScore !== null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = setTimeout(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const needsNetworkingRefresh = projectType === 'networking' && person.match_status === 'stale';
    const needsIdeaValidationFit = projectType === 'startup'
      && person.analysis_status === 'complete'
      && person.match_status !== 'pending'
      && (typeof person.match_score !== 'number' || !person.match_profile_version);
    if (!needsNetworkingRefresh && !needsIdeaValidationFit) return;
    if (rescoreTriggered.current) return;
    rescoreTriggered.current = true;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function rescore() {
      const res = await fetch(`/api/people/${person.id}/rescore`, { method: 'POST' });
      if (!res.ok || cancelled) return;
      setPerson((current) => ({ ...current, match_status: 'pending' }));
      interval = setInterval(async () => {
        const latest = await fetch(`/api/people/${person.id}`);
        if (!latest.ok || cancelled) return;
        const updated = await latest.json() as Person;
        setPerson(updated);
        if (updated.match_status === 'current' || updated.match_status === 'error') {
          if (interval) clearInterval(interval);
        }
      }, 2500);
    }

    void rescore();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [person.analysis_status, person.id, person.match_profile_version, person.match_score, person.match_status, projectType]);

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

  async function handleAddContext(urls: string[], _depth: 'quick' | 'deep', pastedText: string) {
    setRecrawling(true);
    setShowContextForm(false);
    try {
      const currentUrls = person.source_urls ?? [];
      const mergedUrls = [...new Set([...currentUrls, ...urls])];
      const patchBody: {
        source_urls: string[];
        additional_context?: string[];
      } = { source_urls: mergedUrls };

      if (pastedText.trim()) {
        patchBody.additional_context = [pastedText.trim()];
      }

      await fetch(`/api/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });

      const crawlRes = await fetch(`/api/people/${person.id}/crawl`, { method: 'POST' });
      if (crawlRes.ok) {
        setPerson((p) => ({ ...p, crawl_status: 'crawling', analysis_status: 'analyzing' }));
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

  async function handleCopyOutreach(text: string) {
    await navigator.clipboard.writeText(text);
    setCopyingOutreach(true);
    try {
      const res = await fetch(`/api/people/${person.id}/outreach-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        const data = await res.json() as { person: Person; outreach: OutreachRow | null };
        setPerson(data.person);
        if (data.outreach) setSavedOutreach(data.outreach);
        // Backend already moved the person to the `sent` board column; send the
        // user back to the board so they can see the new position.
        router.push(`/dashboard/${slug}/board`);
      }
    } finally {
      setCopyingOutreach(false);
    }
  }

  const isAnalyzing = recrawling || person.crawl_status === 'crawling' || person.analysis_status === 'analyzing';

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
          } else {
            router.push(`/dashboard/${slug}/people`);
          }
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.backIcon}>
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      <div className={styles.content}>
        <div className={styles.profileDashboard}>
          <section className={`${styles.dashboardCard} ${styles.identityCard}`}>
            <div className={styles.identityAvatar} aria-hidden="true">{initialsForName(person.name)}</div>
            <div className={styles.identityContent}>
              <div className={styles.identityTitleRow}>
                <div className={styles.headerIdentity}>
                  <h1 className={styles.name}>{person.name}</h1>
                  {(person.title || person.company) && (
                    <p className={styles.role}>
                      {[person.title, person.company].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <BookmarkButton
                  bookmarked={person.board_status !== null}
                  onToggle={handleBookmarkToggle}
                  loading={bookmarkLoading}
                  showLabel
                />
              </div>

              {personaTags.length > 0 && (
                <div className={styles.headerMeta}>
                  {personaTags.map((tag) => (
                    <PersonaBubble key={tag.key} tag={tag} />
                  ))}
                </div>
              )}

              {analysis?.why_they_matter && (
                <p className={styles.identitySummary}>{analysis.why_they_matter}</p>
              )}

              {sourceCount > 0 && (
                <div className={styles.sourceSummary}>
                  {sourceLinks.slice(0, 3).map((source) => (
                    <a key={`${source.label}-${source.url}`} href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.label}
                    </a>
                  ))}
                  {sources.linkedinPastedNoUrl && <span>LinkedIn profile</span>}
                  <span>{sourceCount} {sourceCount === 1 ? 'source' : 'sources'} researched</span>
                </div>
              )}

              {isAnalyzing && (
                <p className={styles.analyzingNote} role="status">Re-analyzing with updated context…</p>
              )}
            </div>
            <MatchGauge score={matchScore} pending={person.match_status === 'pending'} />
          </section>

          <div className={styles.dashboardGrid}>
            <div className={styles.dashboardMainColumn}>
              {showFitCard && (
                <section className={`${styles.dashboardCard} ${styles.fitCard}`}>
                  <div className={styles.cardEyebrowRow}>
                    <h2 className={styles.cardEyebrow}>{projectType === 'networking' ? 'Match' : 'Idea validation fit'}</h2>
                    <span className={`${styles.fitBadge} ${styles[`fitBadge_${matchRank ?? 'low'}`] ?? ''}`}>{fit.badge}</span>
                  </div>
                  <h3 className={styles.cardHeadline}>{fit.headline}</h3>
                  {matchExplanation && <p className={styles.cardProse}>{matchExplanation}</p>}
                  {hasMatchStatus && (
                    <p className={styles.matchStatus} role="status">
                      {person.match_status === 'pending' ? 'Refreshing score…' : 'Based on an older rubric'}
                    </p>
                  )}
                  {matchFactors && (
                    <div className={styles.matchFactors}>
                      {Object.entries(matchFactors).map(([key, raw]) => {
                        if (typeof raw !== 'number') return null;
                        const value = Math.max(0, Math.min(100, Math.round(raw)));
                        return (
                          <div key={key} className={styles.matchFactor}>
                            <div className={styles.matchFactorHeader}>
                              <span>{MATCH_FACTOR_LABELS[key] ?? key}</span>
                              <span>{value}</span>
                            </div>
                            <div className={styles.matchFactorTrack} aria-hidden="true">
                              <span className={styles.matchFactorFill} style={{ width: `${value}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {questionsPreview.length > 0 && (
                <section className={`${styles.dashboardCard} ${styles.previewCard}`}>
                  <h2 className={styles.cardEyebrow}>What to learn</h2>
                  <h3 className={styles.cardHeadline}>Best questions for this conversation</h3>
                  <ul className={styles.previewList}>
                    {questionsPreview.map((question, index) => (
                      <li key={index}>{question}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className={styles.dashboardSideColumn}>
              <section className={`${styles.dashboardCard} ${styles.stageCard}`}>
                <h2 className={styles.cardEyebrow}>Outreach stage</h2>
                <StageBreadcrumb stage={stage} />
                <div className={styles.stageActionsWrap}>
                  <StageActions person={person} stage={stage} onUpdate={setPerson} compact />
                </div>
              </section>

              {evidencePreview.length > 0 && (
                <section className={`${styles.dashboardCard} ${styles.previewCard}`}>
                  <h2 className={styles.cardEyebrow}>Useful evidence</h2>
                  <div className={styles.evidenceList}>
                    {evidencePreview.map((evidence, index) => (
                      <p key={index}>{evidence}</p>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        <div className={styles.body}>
          {/* ── Call Brief ───────────────────────────────────────────────── */}
          <CallBriefSection personId={person.id} slug={slug} stage={stage} initialPrep={initialCallPrep} />

          {analysis?.sections?.length ? (
            analysis.sections.map((section) => (
              <section key={section.id} className={styles.section}>
                <h2 className={styles.sectionTitle}>{section.title}</h2>
                {section.kind === 'text' ? (
                  <p className={styles.prose}>{section.text}</p>
                ) : (
                  <ul className={styles.list}>
                    {(section.items ?? []).map((item, i) => (
                      <li key={i} className={styles.listItem}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          ) : (
            <>
              {analysis?.summary && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>{modeConfig.personSections.summary}</h2>
                  <p className={styles.prose}>{analysis.summary}</p>
                </section>
              )}

              {analysis?.key_insights?.length ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>{modeConfig.personSections.keyInsights}</h2>
                  <ul className={styles.list}>
                    {analysis.key_insights.map((insight, i) => (
                      <li key={i} className={styles.listItem}>{insight}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {analysis?.recommended_questions?.length ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>{modeConfig.personSections.recommendedQuestions}</h2>
                  <ol className={styles.questionList}>
                    {analysis.recommended_questions.map((q, i) => (
                      <li key={i} className={styles.question}>{q}</li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {analysis?.risk_factors?.length ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>{modeConfig.personSections.riskFactors}</h2>
                  <ul className={styles.list}>
                    {analysis.risk_factors.map((r, i) => (
                      <li key={i} className={styles.listItem}>{r}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}

          {/* ── Outreach ────────────────────────────────────────────────── */}
          <section id="outreach" className={styles.section}>
            <h2 className={styles.sectionTitle}>Outreach</h2>
            {stage === 'to_contact' ? (
              <div className={styles.outreachBox}>
                <p className={styles.outreachHint}>
                  Write your outreach message below, then click <strong>Copy &amp; mark sent</strong> to move this person to the Messaged stage.
                </p>
                <OutreachComposer personId={person.id} slug={slug} initialOutreach={savedOutreach} onCopy={handleCopyOutreach} copying={copyingOutreach} />
              </div>
            ) : (
              <div className={styles.outreachBox}>
                <p className={styles.notFound}>
                  Outreach sent.{person.last_contacted_at && <> Last contacted {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(person.last_contacted_at))}.</>}
                </p>
                {savedOutreach?.content?.body && (
                  <div className={styles.savedOutreach}>
                    {savedOutreach.content.subject && (
                      <p className={styles.outreachSubject}>
                        <span className={styles.outreachSubjectLabel}>Subject:</span> {savedOutreach.content.subject}
                      </p>
                    )}
                    <p className={styles.savedOutreachBody}>{savedOutreach.content.body}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Sources ─────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Sources</h2>
            {hasAnySource ? (
              <dl className={styles.contactGrid}>
                {sources.email && (
                  <><dt className={styles.contactKey}>Email</dt><dd className={styles.contactVal}>{sources.email}</dd></>
                )}
                {sources.linkedin ? (
                  <><dt className={styles.contactKey}>LinkedIn</dt><dd className={styles.contactVal}><a href={sources.linkedin} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>{sources.linkedin}</a></dd></>
                ) : sources.linkedinPastedNoUrl ? (
                  <><dt className={styles.contactKey}>LinkedIn</dt><dd className={styles.contactVal}>URL not provided (pasted profile)</dd></>
                ) : null}
                {sources.twitter && (
                  <><dt className={styles.contactKey}>Twitter</dt><dd className={styles.contactVal}><a href={sources.twitter} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>{sources.twitter}</a></dd></>
                )}
                {sources.website && (
                  <><dt className={styles.contactKey}>Website</dt><dd className={styles.contactVal}><a href={sources.website} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>{sources.website}</a></dd></>
                )}
                {discoveredSources.map((source, i) => (
                  <Fragment key={`${source.url}-${i}`}>
                    <dt className={styles.contactKey}>{discoveredSourceLabel(source)}</dt>
                    <dd className={styles.contactVal}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>{source.url}</a>
                    </dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <p className={styles.notFound}>No sources found.</p>
            )}
          </section>

          {/* ── Transcripts ─────────────────────────────────────────────── */}
          <TranscriptSection personId={person.id} stage={stage} initialTranscripts={initialTranscripts} />

          {person.raw_pasted_text ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Pasted source text</h2>
              <p className={styles.notFound}>
                {person.raw_pasted_text.length.toLocaleString()} characters supplied manually.
              </p>
            </section>
          ) : null}

          {/* ── Add more context ────────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Add more context</h2>
            <p className={styles.contextHint}>
              Paste additional URLs or profile text to deepen the analysis. The profile will be re-analyzed with the new sources.
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
                + Add context
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
