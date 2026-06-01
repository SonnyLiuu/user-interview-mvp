'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { backendClientFetch } from '@/lib/backend-client';
import type { OutreachProjectRecord } from '@/lib/backend-types';
import styles from '@/components/project/ProjectChat.module.css';

type Message = { role: 'assistant' | 'user'; content: string; messageType?: string | null };

type Props = {
  outreachProjectId: string;
  onComplete: () => void;
};

const UPDATE_MARKER = '{"outreach_onboarding_update":';

function stripOutreachUpdate(content: string): string {
  const idx = content.lastIndexOf(UPDATE_MARKER);
  if (idx === -1) return content;

  const before = content.slice(0, idx);
  const fenceIdx = before.lastIndexOf('```');
  if (fenceIdx !== -1 && /^\s*$/.test(before.slice(fenceIdx + 3))) {
    return content.slice(0, fenceIdx).trimEnd();
  }
  return before.trimEnd();
}

function displayContent(content: string): string {
  return stripOutreachUpdate(content)
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
}

function hasCompletedBrief(content: string): boolean {
  return /"brief_ready"\s*:\s*true/.test(content);
}

function progressMessages(project: OutreachProjectRecord): Message[] {
  const raw = project.onboarding_state_json;
  const messages = raw && Array.isArray(raw.messages) ? raw.messages : [];
  return messages.filter((message): message is Message => (
    message
    && (message.role === 'assistant' || message.role === 'user')
    && typeof message.content === 'string'
  ));
}

export default function OutreachOfficeHoursChat({
  outreachProjectId,
  onComplete,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const initialized = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const completeIfProjectIsActive = useCallback(async () => {
    const res = await backendClientFetch(`/v1/outreach-projects/${outreachProjectId}`);
    if (!res.ok) return;
    const project = await res.json() as OutreachProjectRecord;
    if (project.status === 'active') {
      onComplete();
    }
  }, [onComplete, outreachProjectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth' });
  }, [messages, loading, streaming]);

  const streamMessage = useCallback(async (text: string, history: Message[] = []) => {
    setStreaming(true);
    setError('');

    const isInit = text === '__init__';
    const visibleMessages = isInit ? history : [...history, { role: 'user' as const, content: text }];
    setMessages([...visibleMessages, { role: 'assistant', content: '' }]);

    try {
      const res = await backendClientFetch(`/v1/outreach-projects/${outreachProjectId}/office-hours/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          recentMessages: history.slice(-10).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('Failed to stream advisor response');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([...visibleMessages, { role: 'assistant', content: accumulated }]);
      }

      setMessages([...visibleMessages, { role: 'assistant', content: accumulated }]);
      if (hasCompletedBrief(accumulated)) {
        await completeIfProjectIsActive();
      }
    } catch {
      setMessages(history);
      setError('We could not continue the setup chat. Try again.');
    } finally {
      setStreaming(false);
    }
  }, [completeIfProjectIsActive, outreachProjectId]);

  const loadChat = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await backendClientFetch(`/v1/outreach-projects/${outreachProjectId}`);
      if (!res.ok) throw new Error('Failed to load outreach project');
      const project = await res.json() as OutreachProjectRecord;
      const existingMessages = progressMessages(project);
      setMessages(existingMessages);
      if (existingMessages.length === 0 && project.status !== 'active') {
        await streamMessage('__init__', []);
      }
    } catch {
      setError('We could not load the setup chat. Try again.');
    } finally {
      setLoading(false);
    }
  }, [outreachProjectId, streamMessage]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void loadChat();
  }, [loadChat]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    await streamMessage(text, messages);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className={[styles.chat, styles.chatFullPage].join(' ')}>
      <div className={styles.messages}>
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? styles.userMsg : styles.assistantMsg}>
            <span className={styles.msgContent}>{displayContent(message.content)}</span>
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

        {error && (
          <div className={styles.systemMsg}>{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you need to learn, or ask the advisor to choose..."
          rows={1}
          disabled={loading || streaming}
        />
        <button
          className={styles.sendBtn}
          onClick={() => void sendMessage()}
          disabled={loading || streaming || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
