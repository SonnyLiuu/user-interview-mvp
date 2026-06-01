import Link from 'next/link';
import { getNotetakerDownloadHref } from '@/lib/notetaker-download';

export const metadata = {
  title: 'Download User Interview Notetaker',
};

export default function DownloadPage() {
  const installerHref = getNotetakerDownloadHref();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', lineHeight: 1.6, color: '#2a1f14' }}>
      <p style={{ marginBottom: 8 }}>
        <Link href="/" style={{ color: '#8a705a', fontSize: 14 }}>← Back</Link>
      </p>

      <h1 style={{ fontSize: 32, fontWeight: 600, margin: '8px 0 12px' }}>
        User Interview Notetaker for Windows
      </h1>
      <p style={{ color: '#5f4a39', margin: 0, fontSize: 15 }}>
        A small companion app that runs alongside Zoom and auto-checks your
        interview goals as you cover them. The checklist is visible during
        screen shares and saves the transcript back to your dashboard when the
        call ends.
      </p>

      <div style={{ marginTop: 32, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <a
          href={installerHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '12px 22px',
            fontSize: 15,
            fontWeight: 500,
            color: '#fff',
            background: '#a4532b',
            borderRadius: 10,
            textDecoration: 'none',
          }}
        >
          Download for Windows (.exe)
        </a>
        <span style={{ color: '#8a705a', fontSize: 13 }}>v0.1.0 · 64-bit · ~3 MB</span>
      </div>

      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>How to install</h2>
        <ol style={{ paddingLeft: 20, color: '#3a2c1d', fontSize: 15 }}>
          <li style={{ marginBottom: 8 }}>
            Run the installer you just downloaded. It installs to
            <code style={{ background: '#f5ede3', padding: '1px 6px', margin: '0 4px', borderRadius: 4, fontSize: 13.5 }}>
              %LOCALAPPDATA%\Programs\FoundryOverlay
            </code>
            — no admin needed.
          </li>
          <li style={{ marginBottom: 8 }}>
            Launch <strong>User Interview Notetaker</strong> from the Start Menu. A small
            notepad-style overlay appears in the top-right and a tray icon
            shows up next to the clock.
          </li>
          <li style={{ marginBottom: 8 }}>
            Click <strong>Settings</strong> on the overlay → <strong>Sign in</strong>.
            A browser window opens; sign in with your User Interview account.
          </li>
          <li style={{ marginBottom: 8 }}>
            Back in this dashboard, open a scheduled person and click
            <strong> Start call</strong>. The overlay loads that person's brief
            and starts listening when your call starts.
          </li>
        </ol>
      </section>

      <section
        style={{
          marginTop: 40,
          padding: 16,
          background: '#fef9ee',
          border: '1px solid #f0deba',
          borderRadius: 10,
          color: '#5a4422',
          fontSize: 14,
        }}
      >
        <strong style={{ display: 'block', marginBottom: 6 }}>About the SmartScreen warning</strong>
        Windows may show a blue <em>&quot;Windows protected your PC&quot;</em> dialog
        the first time you run the installer. The app is signed with our
        development certificate while we work toward a production EV cert.
        Click <strong>More info → Run anyway</strong> to continue. You only
        need to do this once.
      </section>

      <section style={{ marginTop: 40, color: '#5f4a39', fontSize: 14 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: '#2a1f14' }}>Requirements</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Windows 10 (build 19041 / 20H1) or Windows 11, 64-bit</li>
          <li>
            <a href="https://developer.microsoft.com/microsoft-edge/webview2/" style={{ color: '#a4532b' }}>WebView2 Runtime</a> — preinstalled on Windows 11
          </li>
          <li>Default speaker + microphone set to whatever you use for calls</li>
        </ul>
      </section>
    </main>
  );
}
