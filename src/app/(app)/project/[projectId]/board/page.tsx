export default async function BoardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main style={{ padding: 24 }}>
      <h1>Board — {projectId}</h1>
    </main>
  );
}
