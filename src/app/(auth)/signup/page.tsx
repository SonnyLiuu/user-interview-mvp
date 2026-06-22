import { SignUp } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SignUpPage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
      <SignUp
        routing="hash"
        fallbackRedirectUrl="/onboarding"
        signInFallbackRedirectUrl="/dashboard"
        signInUrl="/login"
      />
    </div>
  );
}
