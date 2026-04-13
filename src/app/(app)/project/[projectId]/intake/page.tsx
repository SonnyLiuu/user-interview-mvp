export default async function IntakePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main style={{ padding: 24 }}>
      <h1>Founder Office Hours — {projectId}</h1>
    </main>
  );
}
