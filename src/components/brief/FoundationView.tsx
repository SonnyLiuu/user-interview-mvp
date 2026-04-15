'use client';

import { useRef, useEffect } from 'react';
import { useFoundation } from './FoundationContext';
import type { Foundation } from '@/lib/backend-types';
import styles from './BriefView.module.css';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconUndo() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="14" height="14">
      <path d="M3 7H11C12.66 7 14 8.34 14 10C14 11.66 12.66 13 11 13H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 4L3 7L6 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="14" height="14">
      <path d="M13 7H5C3.34 7 2 8.34 2 10C2 11.66 3.34 13 5 13H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 4L13 7L10 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Auto-resizing textarea ────────────────────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FoundationView({
  projectId,
  initialFoundation,
}: {
  projectId: string;
  initialFoundation: Foundation;
}) {
  const ctx = useFoundation();
  if (!ctx) return null;

  const { foundation, saveStatus, canUndo, canRedo, handleChange, handleBlur, commitNow, undo, redo } = ctx;

  function updateListItem(field: 'idealPeopleTypes' | 'disqualifiers', idx: number, value: string) {
    const list = [...(foundation[field] ?? [])];
    list[idx] = value;
    handleChange({ ...foundation, [field]: list });
  }

  function removeListItem(field: 'idealPeopleTypes' | 'disqualifiers', idx: number) {
    const list = (foundation[field] ?? []).filter((_, i) => i !== idx);
    commitNow({ ...foundation, [field]: list });
  }

  function addListItem(field: 'idealPeopleTypes' | 'disqualifiers') {
    const list = [...(foundation[field] ?? []), ''];
    commitNow({ ...foundation, [field]: list });
  }

  return (
    <div className={styles.editableOuter}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <IconUndo />
            Undo
          </button>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <IconRedo />
            Redo
          </button>
        </div>
        <span className={styles.saveStatus}>
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && 'Save failed'}
        </span>
      </div>

      {/* Document */}
      <div className={styles.editableContent}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Summary</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.summary ?? ''}
            onChange={(v) => handleChange({ ...foundation, summary: v })}
            onBlur={handleBlur}
            placeholder="Describe what you're building…"
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Target User</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.targetUser ?? ''}
            onChange={(v) => handleChange({ ...foundation, targetUser: v })}
            onBlur={handleBlur}
            placeholder="Who is the primary person experiencing the problem?"
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Core Problem</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.painPoint ?? ''}
            onChange={(v) => handleChange({ ...foundation, painPoint: v })}
            onBlur={handleBlur}
            placeholder="What pain does this solve?"
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Value Proposition</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.valueProp ?? ''}
            onChange={(v) => handleChange({ ...foundation, valueProp: v })}
            onBlur={handleBlur}
            placeholder="What specific value do you deliver?"
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ideal People to Talk To</h2>
          <ul className={styles.list}>
            {(foundation.idealPeopleTypes ?? []).map((item, i) => (
              <li key={i} className={styles.editableListRow}>
                <span className={styles.listBullet}>–</span>
                <AutoTextarea
                  className={styles.editableFieldInline}
                  value={item}
                  onChange={(v) => updateListItem('idealPeopleTypes', i, v)}
                  onBlur={handleBlur}
                  placeholder="Describe this person type…"
                />
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeListItem('idealPeopleTypes', i)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.addItemBtn} onClick={() => addListItem('idealPeopleTypes')}>
            + Add person type
          </button>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Differentiation</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.differentiation ?? ''}
            onChange={(v) => handleChange({ ...foundation, differentiation: v })}
            onBlur={handleBlur}
            placeholder="What makes this different from existing solutions?"
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Disqualifiers</h2>
          <ul className={styles.list}>
            {(foundation.disqualifiers ?? []).map((item, i) => (
              <li key={i} className={styles.editableListRow}>
                <span className={styles.listBullet}>–</span>
                <AutoTextarea
                  className={styles.editableFieldInline}
                  value={item}
                  onChange={(v) => updateListItem('disqualifiers', i, v)}
                  onBlur={handleBlur}
                  placeholder="Who is not a good fit?"
                />
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeListItem('disqualifiers', i)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.addItemBtn} onClick={() => addListItem('disqualifiers')}>
            + Add disqualifier
          </button>
        </section>
      </div>
    </div>
  );
}
