import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldClearNoResponseOutcome } from './crm.ts';

test('no-response outcome clears only when moving back into active outreach stages', () => {
  assert.equal(shouldClearNoResponseOutcome('sent'), true);
  assert.equal(shouldClearNoResponseOutcome('scheduled'), true);
  assert.equal(shouldClearNoResponseOutcome('to_contact'), false);
  assert.equal(shouldClearNoResponseOutcome('completed'), false);
});
