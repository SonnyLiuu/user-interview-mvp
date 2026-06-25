import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ClaimGuestProject from './ClaimGuestProject';

export default async function ClaimPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');
  return <ClaimGuestProject />;
}
