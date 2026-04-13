export default async function InsightsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main style={{ padding: 24 }}>
      <h1>Insights — {projectId}</h1>
    </main>
  );
}
