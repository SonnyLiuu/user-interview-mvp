export default async function BriefPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main style={{ padding: 24 }}>
      <h1>Project Brief — {projectId}</h1>
    </main>
  );
}
