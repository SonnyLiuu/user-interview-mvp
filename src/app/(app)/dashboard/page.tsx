import { redirect } from 'next/navigation';
import { getLatestProject } from '@/lib/backend-server';
import { ExternalServiceError } from '@/lib/errors';
import { getProjectPathSegment } from '@/lib/projects';

export default async function DashboardPage() {
  let latest;
  try {
    ({ project: latest } = await getLatestProject());
  } catch (error) {
    if (error instanceof ExternalServiceError && error.statusCode === 503) {
      return (
        <main style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#faf4ec',
          color: '#2e2115',
        }}>
          <section style={{
            width: 'min(100%, 420px)',
            border: '1px solid #e4d3bd',
            borderRadius: 8,
            background: '#fffdf8',
            padding: 24,
          }}>
            <p style={{
              margin: '0 0 8px',
              color: '#7c6854',
              fontSize: 12,
              fontWeight: 560,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Dashboard unavailable
            </p>
            <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}>
              The database connection is waking up.
            </h1>
            <p style={{ margin: '12px 0 0', color: '#5f4d3b', fontSize: 15, lineHeight: 1.5 }}>
              Refresh in a moment. If this keeps happening, restart the backend server.
            </p>
          </section>
        </main>
      );
    }
    throw error;
  }

  if (latest) {
    redirect(`/dashboard/${getProjectPathSegment(latest)}/foundation`);
  } else {
    redirect('/onboarding');
  }
}
