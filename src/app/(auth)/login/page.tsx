import { SignIn } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
      <SignIn
        routing="hash"
        fallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/onboarding"
        signUpUrl="/signup"
      />
    </div>
  );
}
