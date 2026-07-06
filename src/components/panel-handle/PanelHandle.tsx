'use client';

import styles from './PanelHandle.module.css';

// Tab-shaped collapse/expand handle that sits on the edge of a side panel.
// `side` is the panel edge the handle attaches to: 'right' for a left panel
// (e.g. AppNav), 'left' for a right panel (e.g. the advisor chat).
export function PanelHandle({
  side,
  expanded,
  onClick,
  label,
  controlsId,
}: {
  side: 'left' | 'right';
  expanded: boolean;
  onClick: () => void;
  label: string;
  controlsId?: string;
}) {
  const pointsLeft = side === 'right' ? expanded : !expanded;
  return (
    <button
      type="button"
      className={`${styles.handle} ${side === 'right' ? styles.attachRight : styles.attachLeft}`}
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controlsId}
    >
      <svg viewBox="0 0 8 14" fill="none" aria-hidden="true">
        <path
          d={pointsLeft ? 'M6 1L2 7l4 6' : 'M2 1l4 6-4 6'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
