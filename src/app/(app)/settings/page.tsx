export default function SettingsPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', lineHeight: 1.7 }}>
      <h1 style={{ marginBottom: 12 }}>Account settings</h1>
      <p style={{ margin: 0, color: '#5f4a39' }}>
        Account management is intentionally lightweight right now. Authentication and profile details are currently
        handled by Clerk, and deeper subscription or billing controls have not been added yet.
      </p>
    </main>
  );
}
