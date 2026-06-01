import 'server-only';

import { env } from '@/lib/server-env';
import {
  signDesktopLaunchTokenWithSecret,
  verifyDesktopLaunchTokenWithSecret,
} from '@/lib/desktop-launch-token-core';

type LaunchTokenInput = {
  clerkUserId: string;
  personId: string;
  zoomMeetingIdentifier?: string | null;
};

type VerifyLaunchTokenInput = LaunchTokenInput & {
  token: string;
};

export function signDesktopLaunchToken({ clerkUserId, personId, zoomMeetingIdentifier }: LaunchTokenInput) {
  return signDesktopLaunchTokenWithSecret({
    clerkUserId,
    personId,
    zoomMeetingIdentifier,
    secret: env.FOUNDRY_BACKEND_SHARED_SECRET,
  });
}

export function verifyDesktopLaunchToken({
  token,
  clerkUserId,
  personId,
  zoomMeetingIdentifier,
}: VerifyLaunchTokenInput) {
  return verifyDesktopLaunchTokenWithSecret({
    token,
    clerkUserId,
    personId,
    zoomMeetingIdentifier,
    secret: env.FOUNDRY_BACKEND_SHARED_SECRET,
  });
}
