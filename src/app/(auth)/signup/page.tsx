import { SignUp } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GUEST_ONBOARDING_COOKIE } from '@/lib/guest-onboarding';

export default async function SignUpPage() {
  const { userId } = await auth();
  const hasGuestWork = (await cookies()).has(GUEST_ONBOARDING_COOKIE);
  if (userId) redirect(hasGuestWork ? '/get-started/claim' : '/dashboard');
  const destination = hasGuestWork ? '/get-started/claim' : '/onboarding';

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
      <SignUp
        routing="hash"
        fallbackRedirectUrl={destination}
        signInFallbackRedirectUrl={hasGuestWork ? '/get-started/claim' : '/dashboard'}
        signInUrl="/login"
      />
    </div>
  );
}
