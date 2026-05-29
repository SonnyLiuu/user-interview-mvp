'use client';

import { Fragment, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Person, PersonAnalysis, Transcript, CallPrepContent, OutreachContent, DiscoveredUrl } from '@/lib/db/schema';
import type { ProjectType } from '@/lib/backend-types';
import { getProjectModeConfig } from '@/lib/project-modes';
import { PersonaBubble } from '@/components/people/PersonaBubble';
import type { PersonaType } from '@/components/people/PersonaBubble';
import { RelevanceIndicator } from '@/components/people/RelevanceIndicator';
import { BookmarkButton } from '@/components/people/BookmarkButton';
import { UrlInputForm } from '@/components/people/UrlInputForm';
import { boardStatusToStage, CRM_STAGES, type CRMStage, type CRMOutcome } from '@/lib/crm';
import { BACKEND_ERROR_CODES } from '@/lib/error-codes';
import styles from './PersonDetailClient.module.css';

type Props = {
  person: Person;
  slug: string;
  projectType: ProjectType;
  initialOutreach: { id: string; content: OutreachContent | null } | null;
  initialCallPrep: { id: string; content: CallPrepContent | null } | null;
  initialTranscripts: Transcript[];
};

// ── Source derivation ─────────────────────────────────────────────────────────
//
// The AI sometimes can't extract a LinkedIn URL — typically when the user
// pasted profile text because the LinkedIn crawl was blocked. In that case
// the URL still lives on the person (in source_urls, or sometimes inline in
// the pasted text). Fall through a priority cascade to surface it.

const LINKEDIN_URL_RE = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s)]+/i;
const TWITTER_URL_RE = /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s)]+/i;

function findUrl(re: RegExp, ...haystacks: (string | undefined | null)[]): string | undefined {
  for (const h of haystacks) {
    if (!h) continue;
    const m = h.match(re);
    if (m) return m[0];
  }
  return undefined;
}

function pickFromSourceUrls(sourceUrls: string[], predicate: (u: string) => boolean): string | undefined {
  return sourceUrls.find(predicate);
}

type DerivedSources = {
  email?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  linkedinPastedNoUrl: boolean;
};

function deriveSources(person: Person, analysis: PersonAnalysis | null): DerivedSources {
  const contact = analysis?.contact_info ?? {};
  const sourceUrls = person.source_urls ?? [];
  const additionalContext = (person.additional_context ?? []).join('\n');
  const pastedText = person.raw_pasted_text ?? '';

  const linkedin =
    contact.linkedin ||
    pickFromSourceUrls(sourceUrls, (u) => /linkedin\.com\/in\//i.test(u)) ||
    findUrl(LINKEDIN_URL_RE, pastedText, additionalContext);

  const twitter =
    contact.twitter ||
    pickFromSourceUrls(sourceUrls, (u) => /(?:^|\/\/)(?:www\.)?(?:twitter|x)\.com\//i.test(u)) ||
    findUrl(TWITTER_URL_RE, pastedText, additionalContext);

  const website =
    contact.website ||
    pickFromSourceUrls(sourceUrls, (u) =>
      !/linkedin\.com/i.test(u) && !/(?:twitter|x)\.com/i.test(u)
    );

  // If text was pasted and looks LinkedIn-shaped but we still couldn't find a
  // URL, flag it so the UI can render "LinkedIn — URL not provided" instead of
  // pretending no profile exists.
  const haystack = `${pastedText}\n${additionalContext}`;
  const looksLikeLinkedIn =
    /linkedin/i.test(haystack) ||
    /\bView .+?'s full profile\b/i.test(haystack) ||
    (/\bConnections?\b/i.test(haystack) && /\bExperience\b/i.test(haystack));
  const linkedinPastedNoUrl = !linkedin && pastedText.trim().length > 0 && looksLikeLinkedIn;

  return {
    email: contact.email,
    linkedin,
    twitter,
    website,
    linkedinPastedNoUrl,
  };
}

// ── Auto-detected source labels ───────────────────────────────────────────────

const DISCOVERED_KIND_LABEL: Record<DiscoveredUrl['kind'], string> = {
  github: 'GitHub',
  website: 'Website',
  blog: 'Blog',
};

const MATCH_FACTOR_LABELS: Record<string, string> = {
  recipient_fit: 'Recipient fit',
  topic_overlap: 'Topic overlap',
  shared_context: 'Shared context',
  desired_response_usefulness: 'Response usefulness',
  personalization_quality: 'Personalization',
  evidence_confidence: 'Evidence confidence',
};

function discoveredSourceLabel(source: DiscoveredUrl): string {
  return `Auto-detected ${DISCOVERED_KIND_LABEL[source.kind] ?? source.kind}`;
}

function normalizeUrlKey(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, '').toLowerCase();
  }
}

// ── CRM Stage Breadcrumb ──────────────────────────────────────────────────────

function StageBreadcrumb({ stage }: { stage: CRMStage }) {
  return (
    <div className={styles.stageBreadcrumb}>
      {CRM_STAGES.map(({ id, label }, i) => {
        const stageIndex = CRM_STAGES.findIndex((s) => s.id === stage);
        const isPast = i < stageIndex;
        const isCurrent = id === stage;
        return (
          <div key={id} className={styles.stageStep}>
            {i > 0 && <span className={`${styles.stepDivider} ${isPast || isCurrent ? styles.stepDividerActive : ''}`} />}
            <span className={`${styles.stepLabel} ${isCurrent ? styles.stepCurrent : ''} ${isPast ? styles.stepPast : ''}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Stage Actions ─────────────────────────────────────────────────────────────

type ActionsProps = {
  person: Person;
  stage: CRMStage;
  onUpdate: (updated: Person) => void;
};

function StageActions({ person, stage, onUpdate }: ActionsProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [showIneffective, setShowIneffective] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [showDownloadHint, setShowDownloadHint] = useState(false);

  async function handleStartCall() {
    setLoading('startCall');
    setShowDownloadHint(false);

    try {
      const res = await fetch('/api/desktop/launch-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: person.id }),
      });
      if (!res.ok) {
        setShowDownloadHint(true);
        return;
      }

      const payload = await res.json() as { token?: string };
      if (!payload.token) {
        setShowDownloadHint(true);
        return;
      }

      const url = new URL('foundry://call/start');
      url.searchParams.set('personId', person.id);
      url.searchParams.set('token', payload.token);
      window.location.href = url.toString();
      window.setTimeout(() => setShowDownloadHint(true), 1500);
    } finally {
      setLoading(null);
    }
  }

  async function callApi(path: string, method: string, body?: object) {
    const res = await fetch(`/api/people/${person.id}/${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return await res.json() as Person;
    return null;
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledAt) return;
    setLoading('schedule');
    const updated = await callApi('schedule', 'POST', { scheduledAt });
    setLoading(null);
    if (updated) { onUpdate(updated); setShowSchedule(false); }
  }

  async function handleIneffective(outcome: CRMOutcome) {
    setLoading(outcome);
    const updated = await callApi('ineffective', 'POST', { outcome });
    setLoading(null);
    if (updated) { onUpdate(updated); setShowIneffective(false); }
  }

  if (stage === 'to_contact') {
    return (
      <div className={styles.actionNote}>
        Ready to reach out. Generate a message below and copy it to move this person to <strong>Sent</strong>.
      </div>
    );
  }

  if (stage === 'sent') {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => setShowSchedule((v) => !v)}
        >
          Schedule call
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => setShowIneffective((v) => !v)}
        >
          Outreach ineffective
        </button>

        {showSchedule && (
          <form onSubmit={handleSchedule} className={styles.inlineForm}>
            <input
              type="datetime-local"
              className={styles.dateInput}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
            <button type="submit" className={styles.actionBtn} disabled={!!loading}>
              {loading === 'schedule' ? 'Saving…' : 'Confirm'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowSchedule(false)}>
              Cancel
            </button>
          </form>
        )}

        {showIneffective && (
          <div className={styles.outcomeRow}>
            <span className={styles.outcomeLabel}>What happened?</span>
            <button
              type="button"
              className={styles.outcomeBtn}
              disabled={!!loading}
              onClick={() => handleIneffective('no_response')}
            >
              {loading === 'no_response' ? 'Saving…' : 'No response'}
            </button>
            <button
              type="button"
              className={styles.outcomeBtn}
              disabled={!!loading}
              onClick={() => handleIneffective('not_interested')}
            >
              {loading === 'not_interested' ? 'Saving…' : 'Not interested'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowIneffective(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'scheduled') {
    const scheduledDate = person.call_scheduled_at
      ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(person.call_scheduled_at))
      : null;
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleStartCall}
          disabled={loading === 'startCall'}
        >
          {loading === 'startCall' ? 'Starting...' : 'Start call'}
        </button>
        <div className={styles.actionNote} style={{ flexBasis: '100%' }}>
          {scheduledDate ? <>Call scheduled for <strong>{scheduledDate}</strong>.</> : 'Call scheduled.'}
          {' '}After the call, drag this person to <strong>Completed</strong> on the board.
        </div>
        {showDownloadHint && (
          <div className={styles.actionNote} style={{ flexBasis: '100%' }}>
            Nothing happened? <Link href="/download">Download Foundry Overlay →</Link>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'completed') {
    return (
      <div className={styles.actionNote}>
        Conversation complete.{' '}
        {person.outcome && <span className={styles.outcomePill}>{person.outcome.replace('_', ' ')}</span>}
        {' '}Add transcripts or notes below.
      </div>
    );
  }

  return null;
}

// ── Transcript Section ────────────────────────────────────────────────────────

type TranscriptSectionProps = {
  personId: string;
  stage: CRMStage;
  initialTranscripts: Transcript[];
};

function TranscriptSection({ personId, stage, initialTranscripts }: TranscriptSectionProps) {
  const [transcripts, setTranscripts] = useState<Transcript[]>(initialTranscripts);
  const [content, setContent] = useState('');
  const [type, setType] = useState<'call' | 'message'>('call');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/people/${personId}/transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type }),
    });
    setSaving(false);
    if (res.ok) {
      const created = await res.json() as Transcript;
      setTranscripts((prev) => [created, ...prev]);
      setContent('');
    }
  }

  return (
    <>
      {stage === 'completed' && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Add transcript or notes</h2>
          <form onSubmit={handleSubmit} className={styles.transcriptForm}>
            <div className={styles.typeRow}>
              <label className={styles.typeOption}>
                <input
                  type="radio"
                  name="transcript-type"
                  value="call"
                  checked={type === 'call'}
                  onChange={() => setType('call')}
                  className={styles.radioInput}
                />
                Call transcript
              </label>
              <label className={styles.typeOption}>
                <input
                  type="radio"
                  name="transcript-type"
                  value="message"
                  checked={type === 'message'}
                  onChange={() => setType('message')}
                  className={styles.radioInput}
                />
                Message thread
              </label>
            </div>
            <textarea
              className={styles.transcriptInput}
              placeholder="Paste transcript or notes here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
            />
            <button type="submit" className={styles.actionBtn} disabled={saving || !content.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>
      )}

      {transcripts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Transcript history ({transcripts.length})</h2>
          <div className={styles.transcriptList}>
            {transcripts.map((t) => (
              <div key={t.id} className={styles.transcriptEntry}>
                <div className={styles.transcriptMeta}>
                  <span className={styles.transcriptType}>{t.type === 'call' ? 'Call' : 'Message'}</span>
                  <span className={styles.transcriptDate}>
                    {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(t.created_at!))}
                  </span>
                </div>
                <p className={styles.transcriptContent}>{t.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PersonDetailClient({ person: initialPerson, slug, projectType, initialOutreach, initialCallPrep, initialTranscripts }: Props) {
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
  const sources = deriveSources(person, analysis);
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
  const matchRank = (person.match_rank ?? person.relevance_rank ?? analysis?.match_rank ?? analysis?.relevance_rank) as 'low' | 'medium' | 'high' | null;
  const matchScore = typeof person.match_score === 'number' ? person.match_score : analysis?.match_score ?? null;
  const matchFactors = person.match_factors ?? analysis?.match_factors ?? null;
  const matchExplanation = person.match_explanation ?? analysis?.match_explanation ?? null;

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = setTimeout(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (projectType !== 'networking') return;
    if (person.match_status !== 'stale') return;
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
  }, [person.id, projectType]);

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
                {matchRank && (
                  <RelevanceIndicator rank={matchRank} score={matchScore} stale={person.match_status === 'stale'} />
                )}
              </div>
            </div>
            <div className={styles.headerActions}>
              <BookmarkButton
                bookmarked={person.board_status !== null}
                onToggle={handleBookmarkToggle}
                loading={bookmarkLoading}
              />
            </div>
          </div>

          {analysis?.why_they_matter && (
            <p className={styles.whyMatter}>{analysis.why_they_matter}</p>
          )}

          {isAnalyzing && (
            <p className={styles.analyzingNote} role="status">Re-analyzing with updated context…</p>
          )}
        </div>

        {/* ── CRM Stage ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Outreach stage</h2>
          <StageBreadcrumb stage={stage} />
          <div className={styles.stageActionsWrap}>
            <StageActions person={person} stage={stage} onUpdate={setPerson} />
          </div>
        </section>

        <div className={styles.body}>
          {/* ── Call Brief ───────────────────────────────────────────────── */}
          <CallBriefSection personId={person.id} slug={slug} stage={stage} initialPrep={initialCallPrep} />

          {projectType === 'networking' && (matchRank || matchExplanation || matchFactors) && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Match</h2>
              <div className={styles.matchPanel}>
                <div className={styles.matchSummaryRow}>
                  {matchRank && (
                    <RelevanceIndicator rank={matchRank} score={matchScore} stale={person.match_status === 'stale'} />
                  )}
                  {person.match_status === 'pending' && <span className={styles.matchStatus}>Refreshing score...</span>}
                  {person.match_status === 'stale' && <span className={styles.matchStatus}>Based on an older rubric</span>}
                </div>
                {matchExplanation && <p className={styles.prose}>{matchExplanation}</p>}
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
              </div>
            </section>
          )}

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
                {discoveredSources.map((source, i) => {
                  const included = source.crawl_status === 'included';
                  return (
                    <Fragment key={`${source.url}-${i}`}>
                      <dt className={styles.contactKey}>{discoveredSourceLabel(source)}</dt>
                      <dd className={styles.contactVal}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>{source.url}</a>
                        <span className={included ? styles.discoveredIncluded : styles.discoveredFailed}>
                          {included ? 'Included in analysis' : 'Found, but could not be crawled'}
                        </span>
                        {source.evidence ? <span className={styles.discoveredEvidence}>{source.evidence}</span> : null}
                        {!included && source.crawl_error ? (
                          <span className={styles.discoveredError}>{source.crawl_error}</span>
                        ) : null}
                      </dd>
                    </Fragment>
                  );
                })}
              </dl>
            ) : (
              <p className={styles.notFound}>No sources found.</p>
            )}
          </section>

          {/* ── Outreach ────────────────────────────────────────────────── */}
          <section id="outreach" className={styles.section}>
            <h2 className={styles.sectionTitle}>Outreach</h2>
            {stage === 'to_contact' ? (
              <div className={styles.outreachBox}>
                <p className={styles.outreachHint}>
                  Write your outreach message below, then click <strong>Copy &amp; mark sent</strong> to move this person to the Sent stage.
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

// ── Call Brief Section ────────────────────────────────────────────────────────

type CallPrepRow = { id: string; content: CallPrepContent | null };
type BriefError = { code: 'foundation_required' | 'generic'; message: string };

function CallBriefSection({ personId, slug, stage, initialPrep }: {
  personId: string;
  slug: string;
  stage: CRMStage;
  initialPrep: CallPrepRow | null;
}) {
  const [prep, setPrep] = useState<CallPrepRow | null>(initialPrep);
  const [loading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<BriefError | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}/call-brief`, { method: 'POST' });
      if (res.ok) {
        setPrep(await res.json() as CallPrepRow);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body?.code === BACKEND_ERROR_CODES.foundationRequired) {
        setError({
          code: 'foundation_required',
          message: 'Project foundation is required before generating a call brief.',
        });
      } else {
        setError({
          code: 'generic',
          message: 'Failed to generate brief. Try again.',
        });
      }
    } catch {
      setError({ code: 'generic', message: 'Failed to generate brief. Try again.' });
    } finally {
      setGenerating(false);
    }
  }

  const c = prep?.content;
  const hasContent = !!c && (
    !!c.objective || !!c.closing ||
    !!c.goals?.length || !!c.questions?.length || !!c.signals?.length
  );

  // Hide section entirely when there's nothing to show and no entry point.
  if (!loading && !prep && !error && stage !== 'scheduled') return null;

  return (
    <section id="call-brief" className={styles.section}>
      <div className={styles.callBriefHeader}>
        <h2 className={styles.sectionTitle}>Call brief</h2>
        {prep && (
          <button
            type="button"
            className={styles.regenerateBtn}
            onClick={handleGenerate}
            disabled={loading || generating}
          >
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </div>

      {loading && <p className={styles.callBriefLoading}>Loading…</p>}

      {!loading && error && (
        <div className={styles.callBriefLoading}>
          <p>{error.message}</p>
          {error.code === 'foundation_required' ? (
            <p>
              <Link href={`/dashboard/${slug}/foundation`} className={styles.regenerateBtn}>
                Open project foundation
              </Link>
            </p>
          ) : (
            <button
              type="button"
              className={styles.regenerateBtn}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Generating…' : 'Try again'}
            </button>
          )}
        </div>
      )}

      {!loading && !error && !prep && stage === 'scheduled' && (
        <div className={styles.callBriefLoading}>
          <p>No call brief yet.</p>
          <button
            type="button"
            className={styles.regenerateBtn}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Generate call brief'}
          </button>
        </div>
      )}

      {!loading && !error && prep && !hasContent && (
        <p className={styles.callBriefLoading}>Brief is empty. Click Regenerate to try again.</p>
      )}

      {!loading && !error && c && hasContent && (
        <div className={styles.callBrief}>
          {c.objective && (
            <p className={styles.callBriefObjective}>{c.objective}</p>
          )}

          {c.goals?.length ? (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>Goals</h3>
              <ul className={styles.callBriefList}>
                {c.goals.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          ) : null}

          {c.questions?.length ? (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>Questions</h3>
              <ol className={styles.questionList}>
                {c.questions.map((q, i) => <li key={i} className={styles.question}>{q}</li>)}
              </ol>
            </div>
          ) : null}

          {c.signals?.length ? (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>Signals to listen for</h3>
              <ul className={styles.callBriefList}>
                {c.signals.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}

          {c.closing && (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>How to close</h3>
              <p className={styles.prose}>{c.closing}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Outreach Composer ─────────────────────────────────────────────────────────

type OutreachRow = { id: string; content: OutreachContent | null };
type OutreachError = { code: 'foundation_required' | 'generation_failed' | 'generic'; message: string };

function OutreachComposer({ personId, slug, initialOutreach, onCopy, copying }: {
  personId: string;
  slug: string;
  initialOutreach: OutreachRow | null;
  onCopy: (text: string) => void;
  copying: boolean;
}) {
  const [outreach, setOutreach] = useState<OutreachRow | null>(initialOutreach);
  const [text, setText] = useState(initialOutreach?.content?.body ?? '');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<OutreachError | null>(null);
  const [copied, setCopied] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const autoTriggered = useRef(false);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setText('');
    try {
      const res = await fetch(`/api/people/${personId}/outreach`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as OutreachRow;
        setOutreach(data);
        setText(data.content?.body ?? '');
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body?.code === BACKEND_ERROR_CODES.foundationRequired) {
        setError({ code: 'foundation_required', message: 'Project foundation is required before generating an outreach message.' });
      } else if (body?.code === BACKEND_ERROR_CODES.generationFailed) {
        setError({ code: 'generation_failed', message: 'The model returned an empty message. Try again.' });
      } else {
        setError({ code: 'generic', message: 'Failed to generate message. Try again.' });
      }
    } catch {
      setError({ code: 'generic', message: 'Failed to generate message. Try again.' });
    } finally {
      setGenerating(false);
    }
  }

  // Auto-generate when navigated here from the board with ?generate=outreach.
  // Strip the param after firing so it doesn't re-trigger on rerender/back-nav.
  useEffect(() => {
    if (autoTriggered.current) return;
    if (searchParams.get('generate') !== 'outreach') return;
    autoTriggered.current = true;

    const params = new URLSearchParams(searchParams.toString());
    params.delete('generate');
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}#outreach`, { scroll: false });

    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  async function handleCopy() {
    if (!text.trim()) return;
    await onCopy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.outreachComposer}>
      <div className={styles.outreachGenRow}>
        {outreach?.content?.subject && (
          <p className={styles.outreachSubject}>
            <span className={styles.outreachSubjectLabel}>Subject:</span> {outreach.content.subject}
          </p>
        )}
        <button
          type="button"
          className={styles.regenerateBtn}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'Generating…' : outreach ? 'Regenerate' : 'Generate with AI'}
        </button>
      </div>

      {error && (
        <div className={styles.callBriefLoading}>
          <p>{error.message}</p>
          {error.code === 'foundation_required' ? (
            <Link href={`/dashboard/${slug}/foundation`} className={styles.regenerateBtn}>
              Open project foundation
            </Link>
          ) : (
            <button type="button" className={styles.regenerateBtn} onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Try again'}
            </button>
          )}
        </div>
      )}

      <textarea
        className={styles.outreachTextarea}
        placeholder={generating
          ? 'Generating outreach message…'
          : 'Write or paste your outreach message here, or use Generate with AI above…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        disabled={generating}
      />
      <button
        type="button"
        className={styles.actionBtn}
        onClick={handleCopy}
        disabled={copying || !text.trim()}
      >
        {copied ? 'Copied!' : copying ? 'Copying…' : 'Copy & mark sent'}
      </button>
    </div>
  );
}
