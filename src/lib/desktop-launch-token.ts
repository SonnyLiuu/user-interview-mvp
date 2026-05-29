import 'server-only';

import { env } from '@/lib/server-env';
import {
  signDesktopLaunchTokenWithSecret,
  verifyDesktopLaunchTokenWithSecret,
} from '@/lib/desktop-launch-token-core';

type LaunchTokenInput = {
  clerkUserId: string;
  personId: string;
};

type VerifyLaunchTokenInput = LaunchTokenInput & {
  token: string;
};

export function signDesktopLaunchToken({ clerkUserId, personId }: LaunchTokenInput) {
  return signDesktopLaunchTokenWithSecret({
    clerkUserId,
    personId,
    secret: env.FOUNDRY_BACKEND_SHARED_SECRET,
  });
}

export function verifyDesktopLaunchToken({
  token,
  clerkUserId,
  personId,
}: VerifyLaunchTokenInput) {
  return verifyDesktopLaunchTokenWithSecret({
    token,
    clerkUserId,
    personId,
    secret: env.FOUNDRY_BACKEND_SHARED_SECRET,
  });
}
