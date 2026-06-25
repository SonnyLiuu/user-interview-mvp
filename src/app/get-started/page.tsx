import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GUEST_ONBOARDING_COOKIE } from '@/lib/guest-onboarding';
import GetStartedFlow from './GetStartedFlow';

export default async function GetStartedPage() {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);
  if (userId) {
    redirect(cookieStore.has(GUEST_ONBOARDING_COOKIE) ? '/get-started/claim' : '/onboarding');
  }
  return <GetStartedFlow />;
}
