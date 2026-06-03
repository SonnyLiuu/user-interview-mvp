import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { env } from '@/lib/server-env';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'User Interview', template: '%s | User Interview' },
  description: 'Pressure-test your idea, find the right people, and get smarter after every conversation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <html lang="en" suppressHydrationWarning>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
