'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './ProjectChat.module.css';

type Message = { role: 'assistant' | 'user'; content: string };

type Props = {
  projectId: string;
  initialConversation: Message[];
  hasBrief: boolean;
  onIntakeComplete?: () => void;
};

export default function ProjectChat({ projectId, initialConversation, hasBrief, onIntakeComplete }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialConversation);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [intakeJustCompleted, setIntakeJustCompleted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // If conversation is empty and no brief, send initial greeting
  const initialized = useRef(false);
  const triggerOpener = useCallback(async () => {
    if (initialized.current) return;
    initialized.current = true;
    setStreaming(true);

    let accumulated = '';
    const updated: Message[] = [];
    setMessages([]);

    const res = await fetch(`/api/projects/${projectId}/intake/chat`, {
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

    const finalMsg: Message = { role: 'assistant', content: accumulated };
    updated.push(finalMsg);
    setMessages([...updated]);
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

    const res = await fetch(`/api/projects/${projectId}/intake/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
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

  // Strip the JSON marker from display
  function displayContent(content: string) {
    return content.replace(/\{"intake_complete":\s*true\}/g, '').trim();
  }

  const title = hasBrief ? 'Ongoing Advisor' : 'Founder Office Hours';
  const subtitle = hasBrief
    ? 'Refine your thinking, explore new angles, update assumptions.'
    : 'A structured conversation to build your project brief.';

  return (
    <div className={styles.chat}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>

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

      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={2}
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
