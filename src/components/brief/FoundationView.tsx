'use client';

import { useRef, useEffect } from 'react';
import { useFoundation } from './FoundationContext';
import type { Foundation, ProjectType } from '@/lib/backend-types';
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
  const isNetworking = projectType === 'networking';
  const labels = isNetworking
    ? {
        researchCue: 'Outreach Cue',
        biggestUnknown: 'What targeting or message detail is still uncertain?',
        nextResearchAction: 'What sourcing or personalization action comes next?',
        summary: 'Campaign Context',
        summaryPlaceholder: 'Describe the outreach campaign and goal...',
        targetUser: 'Target Recipients',
        targetUserPlaceholder: 'Who are you trying to reach?',
        painPoint: 'Reason for Outreach',
        painPointPlaceholder: 'What makes the message timely or relevant?',
        valueProp: 'Core Message',
        valuePropPlaceholder: 'What should each message communicate or ask for?',
        idealPeopleTypes: 'Ideal People',
        idealPeoplePlaceholder: 'Describe this recipient type...',
        addPersonType: '+ Add recipient type',
        differentiation: 'Credibility Hook',
        differentiationPlaceholder: 'What personal angle or credibility should the message include?',
        disqualifiers: 'Exclude',
        disqualifierPlaceholder: 'Who should not be included?',
        addDisqualifier: '+ Add exclusion',
      }
    : {
        researchCue: 'Research Cue',
        biggestUnknown: 'What is the biggest unknown to test next?',
        nextResearchAction: 'What people research action would test it?',
        summary: 'Summary',
        summaryPlaceholder: "Describe what you're building...",
        targetUser: 'Target User',
        targetUserPlaceholder: 'Who is the primary person experiencing the problem?',
        painPoint: 'Core Problem',
        painPointPlaceholder: 'What pain does this solve?',
        valueProp: 'Value Proposition',
        valuePropPlaceholder: 'What specific value do you deliver?',
        idealPeopleTypes: 'Ideal People to Talk To',
        idealPeoplePlaceholder: 'Describe this person type...',
        addPersonType: '+ Add person type',
        differentiation: 'Differentiation',
        differentiationPlaceholder: 'What makes this different from existing solutions?',
        disqualifiers: 'Disqualifiers',
        disqualifierPlaceholder: 'Who is not a good fit?',
        addDisqualifier: '+ Add disqualifier',
      };

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
          <h2 className={styles.sectionTitle}>{labels.researchCue}</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.biggestUnknown ?? ''}
            onChange={(v) => handleChange({ ...foundation, biggestUnknown: v })}
            onBlur={handleBlur}
            placeholder={labels.biggestUnknown}
          />
          <AutoTextarea
            className={styles.editableField}
            value={foundation.nextResearchAction ?? ''}
            onChange={(v) => handleChange({ ...foundation, nextResearchAction: v })}
            onBlur={handleBlur}
            placeholder={labels.nextResearchAction}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{labels.summary}</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.summary ?? ''}
            onChange={(v) => handleChange({ ...foundation, summary: v })}
            onBlur={handleBlur}
            placeholder={labels.summaryPlaceholder}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{labels.targetUser}</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.targetUser ?? ''}
            onChange={(v) => handleChange({ ...foundation, targetUser: v })}
            onBlur={handleBlur}
            placeholder={labels.targetUserPlaceholder}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{labels.painPoint}</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.painPoint ?? ''}
            onChange={(v) => handleChange({ ...foundation, painPoint: v })}
            onBlur={handleBlur}
            placeholder={labels.painPointPlaceholder}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{labels.valueProp}</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.valueProp ?? ''}
            onChange={(v) => handleChange({ ...foundation, valueProp: v })}
            onBlur={handleBlur}
            placeholder={labels.valuePropPlaceholder}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{labels.idealPeopleTypes}</h2>
          <ul className={styles.list}>
            {(foundation.idealPeopleTypes ?? []).map((item, i) => (
              <li key={i} className={styles.editableListRow}>
                <span className={styles.listBullet}>–</span>
                <AutoTextarea
                  className={styles.editableFieldInline}
                  value={item}
                  onChange={(v) => updateListItem('idealPeopleTypes', i, v)}
                  onBlur={handleBlur}
                  placeholder={labels.idealPeoplePlaceholder}
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
            {labels.addPersonType}
          </button>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{labels.differentiation}</h2>
          <AutoTextarea
            className={styles.editableField}
            value={foundation.differentiation ?? ''}
            onChange={(v) => handleChange({ ...foundation, differentiation: v })}
            onBlur={handleBlur}
            placeholder={labels.differentiationPlaceholder}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{labels.disqualifiers}</h2>
          <ul className={styles.list}>
            {(foundation.disqualifiers ?? []).map((item, i) => (
              <li key={i} className={styles.editableListRow}>
                <span className={styles.listBullet}>–</span>
                <AutoTextarea
                  className={styles.editableFieldInline}
                  value={item}
                  onChange={(v) => updateListItem('disqualifiers', i, v)}
                  onBlur={handleBlur}
                  placeholder={labels.disqualifierPlaceholder}
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
            {labels.addDisqualifier}
          </button>
        </section>
      </div>
    </div>
  );
}
