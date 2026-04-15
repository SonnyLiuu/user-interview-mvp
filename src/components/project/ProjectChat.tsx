'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { backendClientFetch } from '@/lib/backend-client';
import { useFoundation } from '@/components/brief/FoundationContext';
import type { Foundation } from '@/lib/backend-types';
import styles from './ProjectChat.module.css';

type Message = { role: 'assistant' | 'user'; content: string };

type Props = {
  projectId: string;
  initialConversation: Message[];
  hasBrief: boolean;
  onIntakeComplete?: () => void;
  titleOverride?: string;
  subtitleOverride?: string;
  fullPage?: boolean;
  centerHeading?: string;
};

// ── Patch helpers ─────────────────────────────────────────────────────────────

// Strips {"foundation_patch": ...} from the end of any content string.
// Called on every render during streaming so the JSON never appears in the UI.
function stripFoundationPatch(content: string): string {
  const idx = content.lastIndexOf('{"foundation_patch":');
  return idx !== -1 ? content.slice(0, idx).trimEnd() : content;
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
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialConversation);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [intakeJustCompleted, setIntakeJustCompleted] = useState(false);
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

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStreaming(true);

    // Send last 8 messages as conversation history for the foundation advisor
    const recentMessages = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    const res = await backendClientFetch(`/v1/projects/${projectId}/intake/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, recentMessages }),
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

  return (
    <div className={[styles.chat, fullPage && styles.chatFullPage, isEmpty && styles.chatEmpty].filter(Boolean).join(' ')}>
      {!fullPage && (
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
      )}

      <div className={styles.messages}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? styles.userMsg : styles.assistantMsg}>
            <span className={styles.msgContent}>{displayContent(m.content)}</span>
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
