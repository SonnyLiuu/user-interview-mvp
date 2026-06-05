'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: unknown) => void;
      };
    };
  }
}

function postToDesktop(message: unknown) {
  window.chrome?.webview?.postMessage(message);
}

export default function DesktopAuthPage() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [status, setStatus] = useState('Checking sign-in status...');

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus('Sign in to connect the desktop app.');
      return;
    }

    let cancelled = false;
    async function sendToken() {
      try {
        setStatus('Connecting desktop app...');
        const sessionToken = await getToken();
        const tokenResponse = await fetch('/api/desktop/auth-token', {
          method: 'POST',
          headers: sessionToken ? { authorization: `Bearer ${sessionToken}` } : undefined,
          cache: 'no-store',
        });
        const tokenPayload = await tokenResponse.json() as { token?: string; error?: string };
        const token = tokenPayload.token;
        if (cancelled) return;
        if (!tokenResponse.ok || !token) {
          const message = tokenPayload.error || 'Could not create a desktop auth token.';
          setStatus(message);
          postToDesktop({ type: 'desktopAuthError', error: message });
          return;
        }
        postToDesktop({ type: 'desktopAuthToken', token, userId });
        setStatus('Desktop app connected. You can close this window.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown auth error';
        if (!cancelled) {
          setStatus(message);
          postToDesktop({ type: 'desktopAuthError', error: message });
        }
      }
    }

    sendToken();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, userId]);

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      background: '#171717',
      color: '#f4f4f5',
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      padding: 24,
    }}>
      <section style={{ width: 'min(420px, 100%)' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>User Interview Desktop</h1>
        <p style={{ color: '#a1a1aa', margin: '0 0 24px', fontSize: 14 }}>{status}</p>
        {isLoaded && !isSignedIn ? (
          <SignIn routing="hash" fallbackRedirectUrl="/desktop-auth" signUpUrl="/signup" />
        ) : null}
      </section>
    </main>
  );
}
