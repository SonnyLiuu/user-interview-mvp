export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main style={{ padding: 24 }}>
      <h1>Project — {projectId}</h1>
      <p style={{ color: '#7c6854' }}>Brief + chat interface coming in Phase 2.</p>
    </main>
  );
}
