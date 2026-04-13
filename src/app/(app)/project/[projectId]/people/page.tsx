export default async function PeoplePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main style={{ padding: 24 }}>
      <h1>People — {projectId}</h1>
    </main>
  );
}
