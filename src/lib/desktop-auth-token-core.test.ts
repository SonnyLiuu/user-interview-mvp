import assert from 'node:assert/strict';
import test from 'node:test';

import {
  signDesktopAuthTokenWithSecret,
  verifyDesktopAuthTokenWithSecret,
} from './desktop-auth-token-core.ts';

const secret = 'test-shared-secret';
const now = new Date('2026-06-05T12:00:00.000Z');

test('desktop auth token round-trips for the signed Clerk user', () => {
  const signed = signDesktopAuthTokenWithSecret({
    clerkUserId: 'user_123',
    secret,
    now,
  });

  assert.equal(signed.expiresAt, '2026-07-05T12:00:00.000Z');
  assert.deepEqual(
    verifyDesktopAuthTokenWithSecret({
      token: signed.token,
      secret,
      now,
    }),
    { clerkUserId: 'user_123' },
  );
});

test('desktop auth token rejects tampering, wrong secret, expiry, and malformed tokens', () => {
  const signed = signDesktopAuthTokenWithSecret({
    clerkUserId: 'user_123',
    secret,
    now,
  });
  const [payload, signature] = signed.token.split('.');

  assert.equal(
    verifyDesktopAuthTokenWithSecret({
      token: `${payload}x.${signature}`,
      secret,
      now,
    }),
    null,
  );
  assert.equal(
    verifyDesktopAuthTokenWithSecret({
      token: signed.token,
      secret: 'wrong-secret',
      now,
    }),
    null,
  );
  assert.equal(
    verifyDesktopAuthTokenWithSecret({
      token: signed.token,
      secret,
      now: new Date('2026-07-05T12:00:01.000Z'),
    }),
    null,
  );

  for (const token of ['', 'one-part', 'a.b.c', 'not-json.signature']) {
    assert.equal(
      verifyDesktopAuthTokenWithSecret({
        token,
        secret,
        now,
      }),
      null,
      token,
    );
  }
});
