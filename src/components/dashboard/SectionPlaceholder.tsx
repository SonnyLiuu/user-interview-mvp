type Props = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
};

export function SectionPlaceholder({ eyebrow, title, description, bullets }: Props) {
  return (
    <main
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '32px',
        background: 'linear-gradient(180deg, #fff9f3 0%, #f7efe5 100%)',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          display: 'grid',
          gap: 20,
        }}
      >
        <section
          style={{
            background: 'rgba(255,255,255,0.8)',
            border: '1px solid rgba(133, 87, 46, 0.12)',
            borderRadius: 24,
            padding: 28,
            boxShadow: '0 18px 40px rgba(94, 63, 36, 0.08)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#8a5b34',
            }}
          >
            {eyebrow}
          </p>
          <h1 style={{ margin: '12px 0 10px', fontSize: 34, lineHeight: 1.1, color: '#2d1f14' }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: '#5f4a39' }}>{description}</p>
        </section>

        <section
          style={{
            background: '#fff',
            border: '1px solid rgba(133, 87, 46, 0.12)',
            borderRadius: 24,
            padding: 28,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: '#2d1f14' }}>What this section will eventually handle</h2>
          <ul style={{ margin: '16px 0 0', paddingLeft: 20, color: '#5f4a39', lineHeight: 1.7 }}>
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
