'use client';

import { useRef, useEffect } from 'react';
import { useFoundation } from './FoundationContext';
import type { Foundation, ProjectType } from '@/lib/backend-types';
import { getProjectModeConfig } from '@/lib/project-modes';
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
  projectType = 'startup',
}: {
  projectId: string;
  initialFoundation: Foundation;
  projectType?: ProjectType;
}) {
  const ctx = useFoundation();
  if (!ctx) return null;

  const { foundation, saveStatus, canUndo, canRedo, handleChange, handleBlur, commitNow, undo, redo } = ctx;
  const modeConfig = getProjectModeConfig(projectType);

  function fieldText(key: string) {
    const value = foundation[key];
    return typeof value === 'string' ? value : '';
  }

  function fieldList(key: string) {
    const value = foundation[key];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  function updateListItem(field: string, idx: number, value: string) {
    const list = [...fieldList(field)];
    list[idx] = value;
    handleChange({ ...foundation, [field]: list });
  }

  function removeListItem(field: string, idx: number) {
    const list = fieldList(field).filter((_, i) => i !== idx);
    commitNow({ ...foundation, [field]: list });
  }

  function addListItem(field: string) {
    const list = [...fieldList(field), ''];
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
        {modeConfig.foundationFields.map((field) => (
          <section key={field.key} className={styles.section}>
            <h2 className={styles.sectionTitle}>{field.label}</h2>
            {field.kind === 'list' ? (
              <>
                <ul className={styles.list}>
                  {fieldList(field.key).map((item, i) => (
                    <li key={i} className={styles.editableListRow}>
                      <span className={styles.listBullet}>–</span>
                      <AutoTextarea
                        className={styles.editableFieldInline}
                        value={item}
                        onChange={(v) => updateListItem(field.key, i, v)}
                        onBlur={handleBlur}
                        placeholder={field.placeholder}
                      />
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => removeListItem(field.key, i)}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className={styles.addItemBtn} onClick={() => addListItem(field.key)}>
                  {field.addLabel ?? '+ Add item'}
                </button>
              </>
            ) : (
              <AutoTextarea
                className={styles.editableField}
                value={fieldText(field.key)}
                onChange={(v) => handleChange({ ...foundation, [field.key]: v })}
                onBlur={handleBlur}
                placeholder={field.placeholder}
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
