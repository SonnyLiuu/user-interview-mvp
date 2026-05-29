import assert from 'node:assert/strict';
import test from 'node:test';

import {
  signDesktopLaunchTokenWithSecret,
  verifyDesktopLaunchTokenWithSecret,
} from './desktop-launch-token-core.ts';

const secret = 'test-shared-secret';
const now = new Date('2026-05-29T12:00:00.000Z');

test('desktop launch token round-trips for the intended user and person', () => {
  const signed = signDesktopLaunchTokenWithSecret({
    clerkUserId: 'user_123',
    personId: 'person_456',
    secret,
    now,
  });

  assert.equal(signed.expiresAt, '2026-05-29T12:02:00.000Z');
  assert.equal(
    verifyDesktopLaunchTokenWithSecret({
      token: signed.token,
      clerkUserId: 'user_123',
      personId: 'person_456',
      secret,
      now,
    }),
    true,
  );
});

test('desktop launch token rejects wrong user, wrong person, tampering, and expiry', () => {
  const signed = signDesktopLaunchTokenWithSecret({
    clerkUserId: 'user_123',
    personId: 'person_456',
    secret,
    now,
  });
  const [payload, signature] = signed.token.split('.');

  assert.equal(
    verifyDesktopLaunchTokenWithSecret({
      token: signed.token,
      clerkUserId: 'user_other',
      personId: 'person_456',
      secret,
      now,
    }),
    false,
  );
  assert.equal(
    verifyDesktopLaunchTokenWithSecret({
      token: signed.token,
      clerkUserId: 'user_123',
      personId: 'person_other',
      secret,
      now,
    }),
    false,
  );
  assert.equal(
    verifyDesktopLaunchTokenWithSecret({
      token: `${payload}x.${signature}`,
      clerkUserId: 'user_123',
      personId: 'person_456',
      secret,
      now,
    }),
    false,
  );
  assert.equal(
    verifyDesktopLaunchTokenWithSecret({
      token: signed.token,
      clerkUserId: 'user_123',
      personId: 'person_456',
      secret,
      now: new Date('2026-05-29T12:02:01.000Z'),
    }),
    false,
  );
});

test('desktop launch token rejects malformed tokens', () => {
  for (const token of ['', 'one-part', 'a.b.c', 'not-json.signature']) {
    assert.equal(
      verifyDesktopLaunchTokenWithSecret({
        token,
        clerkUserId: 'user_123',
        personId: 'person_456',
        secret,
        now,
      }),
      false,
      token,
    );
  }
});
