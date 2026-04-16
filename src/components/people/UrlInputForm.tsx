'use client';

import { useState } from 'react';
import styles from './UrlInputForm.module.css';

type Props = {
  onSubmit: (urls: string[], depth: 'quick' | 'deep') => Promise<void>;
  onCancel?: () => void;
  initialUrls?: string[];
  submitLabel?: string;
};

function isValidUrl(val: string) {
  try { new URL(val); return true; } catch { return false; }
}

export function UrlInputForm({ onSubmit, onCancel, initialUrls, submitLabel = 'Research' }: Props) {
  const [urls, setUrls] = useState<string[]>(initialUrls?.length ? initialUrls : ['']);
  const [depth, setDepth] = useState<'quick' | 'deep'>('deep');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const validUrls = urls.map((u) => u.trim()).filter(Boolean);
  const canSubmit = validUrls.length > 0 && validUrls.every(isValidUrl) && !submitting;

  function handleUrlChange(idx: number, val: string) {
    setUrls((prev) => prev.map((u, i) => (i === idx ? val : u)));
    if (error) setError('');
  }

  function addUrl() {
    if (urls.length < 5) setUrls((prev) => [...prev, '']);
  }

  function removeUrl(idx: number) {
    if (urls.length === 1) { setUrls(['']); return; }
    setUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = validUrls;
    if (!cleaned.length) { setError('Enter at least one URL.'); return; }
    const invalid = cleaned.find((u) => !isValidUrl(u));
    if (invalid) { setError(`Not a valid URL: ${invalid}`); return; }

    setSubmitting(true);
    setError('');
    try {
      await onSubmit(cleaned, depth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.hint}>LinkedIn, personal site, GitHub — paste one or more URLs</p>

      <div className={styles.urlList}>
        {urls.map((url, idx) => (
          <div key={idx} className={styles.urlRow}>
            <input
              type="url"
              className={styles.input}
              placeholder="https://..."
              value={url}
              onChange={(e) => handleUrlChange(idx, e.target.value)}
              disabled={submitting}
              autoFocus={idx === 0}
            />
            {urls.length > 1 && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeUrl(idx)}
                disabled={submitting}
                aria-label="Remove URL"
              >
                <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {urls.length < 5 && (
        <button type="button" className={styles.addBtn} onClick={addUrl} disabled={submitting}>
          + Add another URL
        </button>
      )}

      <div className={styles.depthRow}>
        <span className={styles.depthLabel}>Research depth</span>
        <div className={styles.depthToggle}>
          <button
            type="button"
            className={`${styles.depthOption} ${depth === 'quick' ? styles.depthActive : ''}`}
            onClick={() => setDepth('quick')}
            disabled={submitting}
          >
            Quick
          </button>
          <button
            type="button"
            className={`${styles.depthOption} ${depth === 'deep' ? styles.depthActive : ''}`}
            onClick={() => setDepth('deep')}
            disabled={submitting}
          >
            Deep
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
          {submitting ? 'Researching...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
