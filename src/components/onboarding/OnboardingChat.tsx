'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './OnboardingChat.module.css';
import type { SlotKey } from '@/lib/onboarding/slot-definitions';

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
  sessionStatus: string;
};

type OnboardingChatProps = {
  projectId: string;
  onComplete: () => void;
};

type Phase = 'kickoff' | 'choices' | 'finishing' | 'done';

const BOTTOM_THRESHOLD_PX = 32;

export default function OnboardingChat({ projectId, onComplete }: OnboardingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTurn, setCurrentTurn] = useState<CurrentTurn | null>(null);
  const [isFinishable, setIsFinishable] = useState(false);
  const [phase, setPhase] = useState<Phase>('kickoff');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [kickoffText, setKickoffText] = useState('');
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

  // Focus custom input when shown
  useEffect(() => {
    if (showCustomInput) {
      customInputRef.current?.focus();
    }
  }, [showCustomInput]);

  const applyResponse = useCallback((data: ChatResponse) => {
    setMessages(data.messages);
    setCurrentTurn(data.currentTurn);
    setIsFinishable(data.isFinishable);
    setShowCustomInput(false);
    setCustomText('');
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
      const res = await fetch(`/api/projects/${projectId}/onboarding/chat`, {
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

  async function submitKickoff() {
    const text = kickoffText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/onboarding/chat`, {
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

  async function submitChoice(choice: GeneratedChoice) {
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'choice',
          choiceId: choice.id,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit choice');
      }

      const data = await res.json() as ChatResponse;
      applyResponse(data);
    } catch {
      setError('That selection did not go through. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCustom() {
    const text = customText.trim();
    if (!text || submitting || !currentTurn) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          customText: text,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit custom answer');
      }

      const data = await res.json() as ChatResponse;
      applyResponse(data);
    } catch {
      setError('Your custom answer did not go through. Please try again.');
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
      const res = await fetch(`/api/projects/${projectId}/onboarding/chat`, {
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
            {messages.length === 0 && (
              <button className={styles.finishBtn} onClick={() => void loadChat()}>
                Retry
              </button>
            )}
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
            <div className={styles.choiceGrid}>
              {currentTurn.choices.map((choice) => (
                <button
                  key={choice.id}
                  className={styles.choiceBtn}
                  onClick={() => void submitChoice(choice)}
                  disabled={submitting}
                >
                  {choice.label}
                </button>
              ))}
              <button
                className={[styles.choiceBtn, styles.somethingElseBtn].join(' ')}
                onClick={() => setShowCustomInput(true)}
                disabled={submitting}
              >
                Something else
              </button>
            </div>

            {showCustomInput && (
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
                      void submitCustom();
                    }
                  }}
                  rows={2}
                />
                <button
                  className={styles.sendBtn}
                  onClick={() => void submitCustom()}
                  disabled={!customText.trim() || submitting}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}

        {/* Finish prompt */}
        {phase === 'choices' && !submitting && !currentTurn && isFinishable && (
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
          <div className={styles.finishArea}>
            <p className={styles.finishText}>Generating your Foundation...</p>
            <div className={styles.typing}>
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
