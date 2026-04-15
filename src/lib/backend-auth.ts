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

export async function getBackendAccessToken() {
  const { userId } = await auth();
  if (!userId) {
    throw new AuthenticationError('User session not found');
  }

  const user = await currentUser();
  if (!user) {
    throw new AuthenticationError('User profile not available');
  }

  const payload = {
    sub: userId,
    email: user.emailAddresses[0]?.emailAddress ?? '',
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || '',
    avatar_url: user.imageUrl ?? '',
    exp: Math.floor(Date.now() / 1000) + 60 * 5,
  };

  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', env.FOUNDRY_BACKEND_SHARED_SECRET)
    .update(encodedPayload)
    .digest();

  return `${encodedPayload}.${base64Url(signature)}`;
}
