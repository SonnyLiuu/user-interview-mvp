import crypto from 'node:crypto';

const TOKEN_TYPE = 'desktop_call_launch';
const TOKEN_TTL_SECONDS = 60 * 2;

type LaunchTokenPayload = {
  typ: typeof TOKEN_TYPE;
  sub: string;
  personId: string;
  exp: number;
};

type LaunchTokenInput = {
  clerkUserId: string;
  personId: string;
};

type TokenSecret = {
  secret: string;
  now?: number | Date;
};

type VerifyLaunchTokenInput = LaunchTokenInput & TokenSecret & {
  token: string;
};

function unixSeconds(now: number | Date = Date.now()) {
  const millis = now instanceof Date ? now.getTime() : now;
  return Math.floor(millis / 1000);
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function signPayload(encodedPayload: string, secret: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest();
}

export function signDesktopLaunchTokenWithSecret({
  clerkUserId,
  personId,
  secret,
  now,
}: LaunchTokenInput & TokenSecret) {
  const exp = unixSeconds(now) + TOKEN_TTL_SECONDS;
  const payload: LaunchTokenPayload = {
    typ: TOKEN_TYPE,
    sub: clerkUserId,
    personId,
    exp,
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = base64Url(signPayload(encodedPayload, secret));

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyDesktopLaunchTokenWithSecret({
  token,
  clerkUserId,
  personId,
  secret,
  now,
}: VerifyLaunchTokenInput) {
  const parts = token.split('.');
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature || parts.length !== 2) {
    return false;
  }

  let payload: LaunchTokenPayload;
  try {
    const expected = signPayload(encodedPayload, secret);
    const actual = base64UrlDecode(encodedSignature);
    if (expected.length !== actual.length ||
        !crypto.timingSafeEqual(expected, actual)) {
      return false;
    }

    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    return false;
  }

  if (payload.typ !== TOKEN_TYPE) return false;
  if (payload.sub !== clerkUserId) return false;
  if (payload.personId !== personId) return false;
  if (!Number.isFinite(payload.exp)) return false;
  if (payload.exp < unixSeconds(now)) return false;

  return true;
}
