import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
      <SignIn routing="hash" afterSignInUrl="/dashboard" signUpUrl="/signup" />
    </div>
  );
}
