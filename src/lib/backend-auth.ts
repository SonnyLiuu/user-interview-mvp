import 'server-only';

import crypto from 'node:crypto';
import { auth, currentUser } from '@clerk/nextjs/server';
import { env } from '@/lib/server-env';
import { ConfigurationError, AuthenticationError } from '@/lib/errors';

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

type BackendTokenUser = {
  clerkUserId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export function signBackendAccessToken(user: BackendTokenUser) {
  const payload = {
    sub: user.clerkUserId,
    email: user.email,
    name: user.name || user.email,
    avatar_url: user.avatarUrl || '',
    exp: Math.floor(Date.now() / 1000) + 60 * 5,
  };

  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', env.FOUNDRY_BACKEND_SHARED_SECRET)
    .update(encodedPayload)
    .digest();

  return `${encodedPayload}.${base64Url(signature)}`;
}

export function signGuestOnboardingToken(guestToken: string, ipAddress = '') {
  const payload = {
    typ: 'guest_onboarding',
    guest_token: guestToken,
    ip_address: ipAddress,
    exp: Math.floor(Date.now() / 1000) + 60 * 5,
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', env.FOUNDRY_BACKEND_SHARED_SECRET)
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${base64Url(signature)}`;
}

export async function getBackendAccessToken() {
  const { userId } = await auth();
  if (!userId) {
    throw new AuthenticationError('User session not found');
  }

  const user = await currentUser();
  if (!user) {
    throw new AuthenticationError('User profile not available');
  }

  return signBackendAccessToken({
    clerkUserId: userId,
    email: user.emailAddresses[0]?.emailAddress ?? '',
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || '',
    avatarUrl: user.imageUrl ?? '',
  });
}
