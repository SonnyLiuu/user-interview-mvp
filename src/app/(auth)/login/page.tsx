import { SignIn } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GUEST_ONBOARDING_COOKIE } from '@/lib/guest-onboarding';

export default async function LoginPage() {
  const { userId } = await auth();
  const hasGuestWork = (await cookies()).has(GUEST_ONBOARDING_COOKIE);
  if (userId) redirect(hasGuestWork ? '/get-started/claim' : '/dashboard');

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
      <SignIn
        routing="hash"
        fallbackRedirectUrl={hasGuestWork ? '/get-started/claim' : '/dashboard'}
        signUpFallbackRedirectUrl={hasGuestWork ? '/get-started/claim' : '/onboarding'}
        signUpUrl="/signup"
      />
    </div>
  );
}
