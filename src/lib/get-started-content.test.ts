import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTRY_GOAL_OPTIONS, STARTUP_STAGE_OPTIONS } from './get-started-content.ts';

test('public startup intake exposes every approved stage and goal with custom copy', () => {
  assert.equal(STARTUP_STAGE_OPTIONS.length, 6);
  assert.equal(ENTRY_GOAL_OPTIONS.length, 7);
  assert.equal(new Set(STARTUP_STAGE_OPTIONS.map((option) => option.id)).size, 6);
  assert.equal(new Set(ENTRY_GOAL_OPTIONS.map((option) => option.id)).size, 7);

  for (const option of [...STARTUP_STAGE_OPTIONS, ...ENTRY_GOAL_OPTIONS]) {
    assert.ok(option.label.length > 0);
    assert.ok(option.blurbTitle.length > 0);
    assert.ok(option.blurbBody.length > 40);
  }
});
