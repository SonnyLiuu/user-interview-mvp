'use client';

import styles from './BookmarkButton.module.css';

type Props = {
  bookmarked: boolean;
  onToggle: () => void;
  loading?: boolean;
};

export function BookmarkButton({ bookmarked, onToggle, loading }: Props) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${bookmarked ? styles.active : ''}`}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(); }}
      disabled={loading}
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this person'}
      title={bookmarked ? 'Bookmarked — saved to Board' : 'Bookmark to save to Board'}
    >
      <svg viewBox="0 0 18 22" fill="none" aria-hidden="true" className={styles.icon}>
        {bookmarked ? (
          <path
            d="M3 2h12a1 1 0 0 1 1 1v16.27a.5.5 0 0 1-.82.39L9 15.5l-6.18 4.16A.5.5 0 0 1 2 19.27V3a1 1 0 0 1 1-1z"
            fill="currentColor"
          />
        ) : (
          <path
            d="M3 2h12a1 1 0 0 1 1 1v16.27a.5.5 0 0 1-.82.39L9 15.5l-6.18 4.16A.5.5 0 0 1 2 19.27V3a1 1 0 0 1 1-1z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}
