'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { backendClientFetch } from '@/lib/backend-client';
import { useFoundation } from '@/components/brief/FoundationContext';
import type { Foundation } from '@/lib/backend-types';
import { PanelHandle } from '@/components/panel-handle/PanelHandle';
import styles from './ProjectChat.module.css';

type Message = { role: 'assistant' | 'user'; content: string };

const ADVISOR_INTRO = "Hi, let's sharpen your foundation further. Describe what you'd like to add or change and I can automatically apply your ideas into the foundation document. What sections need more detail?";

type Props = {
  projectId: string;
  initialConversation: Message[];
  hasBrief: boolean;
  onIntakeComplete?: () => void;
  titleOverride?: string;
  subtitleOverride?: string;
  fullPage?: boolean;
  centerHeading?: string;
  inputId?: string;
  advisorIntroEventName?: string;
  advisorAlertId?: string;
  collapsible?: boolean;
};

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 5.5V2.75l-1.2 1.2A5.25 5.25 0 1 0 13.2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Patch helpers ─────────────────────────────────────────────────────────────

// Strips {"foundation_patch": ...} (possibly wrapped in ```json fences) from the
// end of any content string. Called on every render during streaming so the JSON
// never appears in the UI.
function stripFoundationPatch(content: string): string {
  const marker = '{"foundation_patch":';
  const idx = content.lastIndexOf(marker);
  if (idx === -1) return content;

  // Walk backwards from the marker to find and strip any opening ```json fence
  let start = idx;
  const before = content.slice(0, idx);
  const fenceIdx = before.lastIndexOf('```');
  if (fenceIdx !== -1) {
    // Make sure the fence is on its own line (only whitespace between fence and marker)
    const between = before.slice(fenceIdx + 3, idx);
    if (/^\s*$/.test(between)) {
      start = fenceIdx;
    }
  }
  return content.slice(0, start).trimEnd();
}

// Extracts the patch object from the completed response. Uses brace-counting
// to handle nested structures (arrays, nested objects).
function extractFoundationPatch(content: string): Partial<Foundation> | null {
  const marker = '{"foundation_patch":';
  const idx = content.lastIndexOf(marker);
  if (idx === -1) return null;

  const fragment = content.slice(idx);
  let depth = 0;
  let end = -1;
  for (let i = 0; i < fragment.length; i++) {
    if (fragment[i] === '{') depth++;
    else if (fragment[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(fragment.slice(0, end + 1)) as { foundation_patch?: Partial<Foundation> };
    return parsed.foundation_patch ?? null;
  } catch {
    return null;
  }
}

function displayContent(content: string): string {
  return stripFoundationPatch(content)
    .replace(/\{"intake_complete":\s*true\}/g, '')
    // Strip markdown bold (**text**) and italic (*text*)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    // Strip any stray ```json or ``` fences left behind
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectChat({
  projectId,
  initialConversation,
  hasBrief,
  onIntakeComplete,
  titleOverride,
  subtitleOverride,
  fullPage,
  centerHeading,
  inputId,
  advisorIntroEventName,
  advisorAlertId,
  collapsible = false,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!advisorIntroEventName || initialConversation.some((message) => (
      message.role === 'assistant' && message.content === ADVISOR_INTRO
    ))) {
      return initialConversation;
    }
    return [...initialConversation, { role: 'assistant', content: ADVISOR_INTRO }];
  });
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [intakeJustCompleted, setIntakeJustCompleted] = useState(false);
  const [collapsed, setCollapsed] = useState(collapsible);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Foundation context — null when ProjectChat is used outside a FoundationProvider
  const foundationCtx = useFoundation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const initialized = useRef(false);
  const triggerOpener = useCallback(async () => {
    if (initialized.current) return;
    initialized.current = true;
    setStreaming(true);

    let accumulated = '';
    setMessages([]);

    const res = await backendClientFetch(`/v1/projects/${projectId}/intake/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '__init__' }),
    });

    if (!res.ok || !res.body) { setStreaming(false); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    setMessages([{ role: 'assistant', content: '' }]);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      setMessages([{ role: 'assistant', content: accumulated }]);
    }

    setMessages([{ role: 'assistant', content: accumulated }]);
    setStreaming(false);
  }, [projectId]);

  useEffect(() => {
    if (initialConversation.length === 0 && !hasBrief) {
      triggerOpener();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!advisorIntroEventName) return;

    function handleAdvisorIntro() {
      setCollapsed(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }

    window.addEventListener(advisorIntroEventName, handleAdvisorIntro);
    return () => window.removeEventListener(advisorIntroEventName, handleAdvisorIntro);
  }, [advisorIntroEventName]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    if (hasBrief && advisorAlertId) {
      window.localStorage.setItem(`recommendation-alert-dismissed:${projectId}:${advisorAlertId}`, 'true');
      window.dispatchEvent(new CustomEvent('recommendation-alert:dismiss', {
        detail: { alertId: advisorAlertId, storageScope: projectId },
      }));
    }
    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStreaming(true);

    // Send last 8 messages as conversation history for the foundation advisor
    const recentMessages = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    const res = await backendClientFetch(`/v1/projects/${projectId}/intake/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, recentMessages, conversation: messages }),
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      setMessages([...newMessages, { role: 'assistant', content: accumulated }]);
    }

    setStreaming(false);

    // Apply foundation patch if the advisor included one
    if (foundationCtx) {
      const patch = extractFoundationPatch(accumulated);
      if (patch) foundationCtx.applyPatch(patch);
    }

    if (accumulated.includes('"intake_complete": true')) {
      setIntakeJustCompleted(true);
      onIntakeComplete?.();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const title = titleOverride ?? (hasBrief ? 'Ongoing Advisor' : 'Founder Office Hours');
  const subtitle = subtitleOverride ?? (hasBrief
    ? 'Refine your thinking, explore new angles, update assumptions.'
    : 'Make edits to your foundation brief, or add more information about your project.');

  const isEmpty = fullPage && messages.length === 0 && !streaming;
  const panelId = inputId ? `${inputId}-panel` : undefined;

  if (collapsible && collapsed) {
    return (
      <div className={styles.collapsedBar} data-collapsed="true">
        <PanelHandle
          side="left"
          expanded={false}
          onClick={() => setCollapsed(false)}
          label={`Expand ${title}`}
        />
      </div>
    );
  }

  async function resetChat() {
    if (streaming || resetting) return;

    setResetting(true);
    try {
      const res = await backendClientFetch(`/v1/projects/${projectId}/intake/chat`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessages(advisorIntroEventName ? [{ role: 'assistant', content: ADVISOR_INTRO }] : []);
        setInput('');
        setIntakeJustCompleted(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } finally {
      setResetting(false);
    }
  }

  return (
    <div
      id={panelId}
      className={[styles.chat, fullPage && styles.chatFullPage, isEmpty && styles.chatEmpty].filter(Boolean).join(' ')}
      data-collapsed="false"
    >
      {collapsible && (
        <PanelHandle
          side="left"
          expanded
          onClick={() => setCollapsed(true)}
          label={`Collapse ${title}`}
          controlsId={panelId}
        />
      )}
      {!fullPage && (
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.title}>{title}</span>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>
          <div className={styles.headerActions}>
            {hasBrief && (
              <button
                type="button"
                className={[styles.headerCollapse, resetting && styles.refreshing].filter(Boolean).join(' ')}
                onClick={resetChat}
                aria-label={`Start a new ${title} chat`}
                title="Start a new chat"
                disabled={streaming || resetting}
              >
                <RefreshIcon />
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.messages}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? styles.userMsg : styles.assistantMsg}>
            {m.role === 'assistant' && streaming && i === messages.length - 1 && !displayContent(m.content) ? (
              <span className={styles.typing} aria-label="Advisor is responding" role="status">
                <span /><span /><span />
              </span>
            ) : (
              <span className={styles.msgContent}>{displayContent(m.content)}</span>
            )}
          </div>
        ))}

        {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className={styles.assistantMsg}>
            <span className={styles.typing}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}

        {intakeJustCompleted && (
          <div className={styles.systemMsg}>
            Brief is generating — this takes about 15 seconds.
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {isEmpty && centerHeading && (
        <p className={styles.centerHeading}>{centerHeading}</p>
      )}

      <div className={styles.inputRow}>
        <textarea
          id={inputId}
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Propose an edit..."
          rows={fullPage ? 1 : 2}
          disabled={streaming}
        />
        <button
          className={styles.sendBtn}
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
