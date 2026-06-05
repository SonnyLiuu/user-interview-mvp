import crypto from 'node:crypto';

const TOKEN_TYPE = 'desktop_app_auth';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

type DesktopAuthTokenPayload = {
  typ: typeof TOKEN_TYPE;
  sub: string;
  exp: number;
};

type TokenSecret = {
  secret: string;
  now?: number | Date;
};

type SignDesktopAuthTokenInput = TokenSecret & {
  clerkUserId: string;
};

type VerifyDesktopAuthTokenInput = TokenSecret & {
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

export function signDesktopAuthTokenWithSecret({
  clerkUserId,
  secret,
  now,
}: SignDesktopAuthTokenInput) {
  const exp = unixSeconds(now) + TOKEN_TTL_SECONDS;
  const payload: DesktopAuthTokenPayload = {
    typ: TOKEN_TYPE,
    sub: clerkUserId,
    exp,
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = base64Url(signPayload(encodedPayload, secret));

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyDesktopAuthTokenWithSecret({
  token,
  secret,
  now,
}: VerifyDesktopAuthTokenInput) {
  const parts = token.split('.');
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature || parts.length !== 2) {
    return null;
  }

  let payload: DesktopAuthTokenPayload;
  try {
    const expected = signPayload(encodedPayload, secret);
    const actual = base64UrlDecode(encodedSignature);
    if (
      expected.length !== actual.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) {
      return null;
    }

    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    return null;
  }

  if (payload.typ !== TOKEN_TYPE) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (!Number.isFinite(payload.exp)) return null;
  if (payload.exp < unixSeconds(now)) return null;

  return { clerkUserId: payload.sub };
}
