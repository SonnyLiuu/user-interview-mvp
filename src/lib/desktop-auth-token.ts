import 'server-only';

import { env } from '@/lib/server-env';
import {
  signDesktopAuthTokenWithSecret,
  verifyDesktopAuthTokenWithSecret,
} from '@/lib/desktop-auth-token-core';

export function signDesktopAuthToken({ clerkUserId }: { clerkUserId: string }) {
  return signDesktopAuthTokenWithSecret({
    clerkUserId,
    secret: env.FOUNDRY_BACKEND_SHARED_SECRET,
  });
}

export function verifyDesktopAuthToken(token: string) {
  return verifyDesktopAuthTokenWithSecret({
    token,
    secret: env.FOUNDRY_BACKEND_SHARED_SECRET,
  });
}
