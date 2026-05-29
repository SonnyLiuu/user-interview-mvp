import Link from 'next/link';
import { env } from '@/lib/server-env';

export default function SettingsPage() {
  const installerHref = env.FOUNDRY_OVERLAY_INSTALLER_URL?.trim();

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', lineHeight: 1.7 }}>
      <h1 style={{ marginBottom: 12 }}>Account settings</h1>
      <p style={{ margin: 0, color: '#5f4a39' }}>
        Account management is intentionally lightweight right now. Authentication and profile details are currently
        handled by Clerk, and deeper subscription or billing controls have not been added yet.
      </p>

      <section
        style={{
          marginTop: 36,
          padding: 20,
          border: '1px solid #e6d6bf',
          borderRadius: 12,
          background: '#fdfaf4',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px', color: '#2a1f14' }}>
          Desktop companion
        </h2>
        <p style={{ margin: '0 0 14px', color: '#5f4a39', fontSize: 14.5 }}>
          Foundry Overlay runs alongside Zoom and auto-checks your interview
          goals as you cover them. Install once, sign in, and use{' '}
          <strong>Start call</strong> from any scheduled person to launch it.
        </p>
        {installerHref ? (
          <a
            href={installerHref}
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              background: '#a4532b',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            Download for Windows →
          </a>
        ) : (
          <Link
            href="/download"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#7a5a38',
              background: '#f5ede3',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            Installer not published yet
          </Link>
        )}
        <span style={{ marginLeft: 12, color: '#8a705a', fontSize: 13 }}>v0.1.0</span>
      </section>
    </main>
  );
}
