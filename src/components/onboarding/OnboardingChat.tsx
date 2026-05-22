'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { backendClientFetch } from '@/lib/backend-client';
import styles from './OnboardingChat.module.css';

type SlotKey =
  | 'ideaSummary'
  | 'targetUser'
  | 'painPoint'
  | 'valueProp'
  | 'idealPeopleTypes'
  | 'differentiation'
  | 'disqualifiers';

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
  messageType?: string;
};

type GeneratedChoice = {
  id: string;
  label: string;
  normalizedValue: string;
  slotKey: SlotKey;
};

type CurrentTurn = {
  question: string;
  choices: GeneratedChoice[];
  customPlaceholder: string;
  targetSlot: SlotKey;
};

type ChatResponse = {
  messages: ChatMessage[];
  currentTurn: CurrentTurn | null;
  isFinishable: boolean;
  sessionStatus: 'active' | 'ready' | 'completed';
};

type OnboardingChatProps = {
  projectId: string;
  onComplete: () => void;
};

type Phase = 'kickoff' | 'choices' | 'finishing' | 'done';

const BOTTOM_THRESHOLD_PX = 32;

const FINISHING_STATUSES = [
  'Re-reading your answers',
  'Identifying the sharpest pain points',
  'Sketching your target user',
  'Drafting your Foundation',
  'Polishing the details',
];

const FINISHING_STATUS_INTERVAL_MS = 2400;

export default function OnboardingChat({ projectId, onComplete }: OnboardingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTurn, setCurrentTurn] = useState<CurrentTurn | null>(null);
  const [isFinishable, setIsFinishable] = useState(false);
  const [phase, setPhase] = useState<Phase>('kickoff');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [customText, setCustomText] = useState('');
  const [selectedChoiceIds, setSelectedChoiceIds] = useState<string[]>([]);
  const [kickoffText, setKickoffText] = useState('');
  const [finishingStatusIndex, setFinishingStatusIndex] = useState(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);
  const shouldStickToBottomRef = useRef(true);

  const syncScrollIntent = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth' });
    }
  }, [messages, currentTurn, loading]);

  const applyResponse = useCallback((data: ChatResponse) => {
    setMessages(data.messages);
    setCurrentTurn(data.currentTurn);
    setIsFinishable(data.isFinishable);
    setCustomText('');
    setSelectedChoiceIds([]);
    setError('');
    shouldStickToBottomRef.current = true;

    if (data.sessionStatus === 'completed') {
      setPhase('done');
    } else if (data.currentTurn || data.isFinishable) {
      setPhase('choices');
    } else {
      setPhase('kickoff');
    }
  }, []);

  const loadChat = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${projectId}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: '__init__' }),
      });

      if (!res.ok) {
        throw new Error('Failed to load onboarding');
      }

      const data = await res.json() as ChatResponse;
      applyResponse(data);
    } catch {
      setError('We could not load your onboarding chat. Try again.');
    } finally {
      setLoading(false);
    }
  }, [applyResponse, projectId]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (phase !== 'finishing') {
      setFinishingStatusIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setFinishingStatusIndex((prev) => Math.min(prev + 1, FINISHING_STATUSES.length - 1));
    }, FINISHING_STATUS_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  async function submitKickoff() {
    const text = kickoffText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${projectId}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'kickoff', message: text }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit kickoff');
      }

      const data = await res.json() as ChatResponse;
      setKickoffText('');
      applyResponse(data);
    } catch {
      setError('Your answer did not go through. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleChoice(choice: GeneratedChoice) {
    if (submitting) return;
    setSelectedChoiceIds((current) => (
      current.includes(choice.id)
        ? current.filter((choiceId) => choiceId !== choice.id)
        : [...current, choice.id]
    ));
    if (error) setError('');
  }

  async function submitAnswer() {
    const text = customText.trim();
    if ((!text && selectedChoiceIds.length === 0) || submitting || !currentTurn) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${projectId}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'answer',
          choiceIds: selectedChoiceIds,
          customText: text || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit answer');
      }

      const data = await res.json() as ChatResponse;
      applyResponse(data);
    } catch {
      setError('Your answer did not go through. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function finish() {
    if (submitting) return;
    setSubmitting(true);
    setPhase('finishing');
    setError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${projectId}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'finish' }),
      });

      if (!res.ok) {
        throw new Error('Failed to finish onboarding');
      }

      onComplete();
    } catch {
      setError('We could not generate your Foundation yet. Please try again.');
      setPhase(currentTurn || isFinishable ? 'choices' : 'kickoff');
    } finally {
      setSubmitting(false);
    }
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className={[styles.chat, isEmpty && styles.chatEmpty].filter(Boolean).join(' ')}>
      {/* Transcript */}
      <div ref={messagesRef} className={styles.messages} onScroll={syncScrollIntent}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'assistant' ? styles.assistantMsg : styles.userMsg}
          >
            <p className={styles.msgContent}>{msg.content}</p>
          </div>
        ))}

        {/* Typing indicator while submitting */}
        {submitting && (
          <div className={styles.assistantMsg}>
            <div className={styles.typing}>
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className={styles.inputArea}>
        {error && (
          <div className={styles.finishArea}>
            <p className={styles.finishText}>{error}</p>
            {messages.length === 0 ? (
              <button className={styles.finishBtn} onClick={() => void loadChat()}>
                Retry
              </button>
            ) : isFinishable && !currentTurn ? (
              <button className={styles.finishBtn} onClick={() => void finish()}>
                Generate Foundation -&gt;
              </button>
            ) : null}
          </div>
        )}
        {/* Kickoff phase — free text */}
        {phase === 'kickoff' && !loading && (
          <>
            {isEmpty && (
              <p className={styles.kickoffHeading}>Let&apos;s get to know your idea.</p>
            )}
            <div className={styles.kickoffRow}>
              <textarea
                className={styles.kickoffTextarea}
                placeholder="Describe your idea, who it's for, and what problem it solves..."
                value={kickoffText}
                onChange={(e) => {
                  setKickoffText(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submitKickoff();
                  }
                }}
                rows={2}
                disabled={submitting}
              />
              <button
                className={styles.sendBtn}
                onClick={() => void submitKickoff()}
                disabled={!kickoffText.trim() || submitting}
              >
                Send
              </button>
            </div>
          </>
        )}

        {/* Choices phase */}
        {phase === 'choices' && !submitting && currentTurn && (
          <div className={styles.choicesArea}>
            <p className={styles.choiceIntro}>
              Select suggestions to combine, or reference their numbers while you refine your answer below.
            </p>
            <div className={styles.choiceGrid}>
              {currentTurn.choices.map((choice, index) => {
                const selected = selectedChoiceIds.includes(choice.id);
                return (
                  <button
                    key={choice.id}
                    className={[styles.choiceBtn, selected && styles.choiceBtnSelected].filter(Boolean).join(' ')}
                    onClick={() => toggleChoice(choice)}
                    aria-pressed={selected}
                    disabled={submitting}
                  >
                    <span className={styles.choiceNumber}>{index + 1}</span>
                    <span>{choice.label}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.customInputRow}>
              <textarea
                ref={customInputRef}
                className={styles.customTextarea}
                placeholder={currentTurn.customPlaceholder}
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submitAnswer();
                  }
                }}
                rows={2}
              />
              <button
                className={styles.sendBtn}
                onClick={() => void submitAnswer()}
                disabled={(!customText.trim() && selectedChoiceIds.length === 0) || submitting}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Finish prompt */}
        {phase === 'choices' && !submitting && !currentTurn && isFinishable && !error && (
          <div className={styles.finishArea}>
            <p className={styles.finishText}>
              That&apos;s enough to build your Foundation. Ready to continue?
            </p>
            <button className={styles.finishBtn} onClick={() => void finish()}>
              Generate Foundation -&gt;
            </button>
          </div>
        )}

        {/* Finishing state */}
        {phase === 'finishing' && (
          <div className={styles.finishingArea} role="status" aria-live="polite">
            <div className={styles.finishingHeader}>
              <span className={styles.finishingPulse} aria-hidden="true" />
              <p className={styles.finishingTitle}>Generating your Foundation</p>
            </div>
            <p key={finishingStatusIndex} className={styles.finishingStatus}>
              {FINISHING_STATUSES[finishingStatusIndex]}
              <span className={styles.finishingEllipsis} aria-hidden="true">
                <span /><span /><span />
              </span>
            </p>
            <div className={styles.finishingProgress} aria-hidden="true">
              <div className={styles.finishingProgressBar} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
