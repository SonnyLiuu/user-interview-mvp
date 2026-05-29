import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeFoundryBaseUrl } from './desktop-live-session.ts';

test('normalizes the public FastAPI URL returned to the desktop app', () => {
  assert.equal(normalizeFoundryBaseUrl(undefined), 'http://127.0.0.1:8001');
  assert.equal(normalizeFoundryBaseUrl('127.0.0.1:8001/'), 'http://127.0.0.1:8001');
  assert.equal(normalizeFoundryBaseUrl(' https://api.example.com/live/ '), 'https://api.example.com/live');
});
