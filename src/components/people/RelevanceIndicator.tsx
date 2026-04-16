import styles from './RelevanceIndicator.module.css';

type Rank = 'low' | 'medium' | 'high';

// Semicircular gauge: viewBox 72×42, center (36,36), radius 30.
// Arc goes from left endpoint (6,36) via top (36,6) to right (66,36) — sweep=1 (positive θ).
// Needle positions: low≈210°, medium=270°, high≈330°.
const GAUGE: Record<Rank, { arcD: string; tipX: number; tipY: number; color: string; label: string }> = {
  low: {
    arcD: 'M 6 36 A 30 30 0 0 1 10.1 21',
    tipX: 10.1,
    tipY: 21,
    color: '#c54a2e',
    label: 'Low match',
  },
  medium: {
    arcD: 'M 6 36 A 30 30 0 0 1 36 6',
    tipX: 36,
    tipY: 6,
    color: '#c97b2a',
    label: 'Medium match',
  },
  high: {
    arcD: 'M 6 36 A 30 30 0 0 1 61.9 21',
    tipX: 61.9,
    tipY: 21,
    color: '#4a8c5c',
    label: 'High match',
  },
};

export function RelevanceIndicator({ rank }: { rank: Rank }) {
  const g = GAUGE[rank];
  return (
    <div className={styles.wrap}>
      <svg viewBox="0 0 72 42" width="72" height="42" fill="none" className={styles.gauge} aria-hidden="true">
        {/* Track */}
        <path
          d="M 6 36 A 30 30 0 0 1 66 36"
          stroke="#e8d9c4"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Fill */}
        <path
          d={g.arcD}
          stroke={g.color}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Needle tip */}
        <circle cx={g.tipX} cy={g.tipY} r="4.5" fill={g.color} />
      </svg>
      <span className={styles.label} style={{ color: g.color }}>{g.label}</span>
    </div>
  );
}
