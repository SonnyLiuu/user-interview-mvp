import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_OUTREACH_PROJECT_TYPES,
  OUTREACH_PROJECT_TYPE_CONFIGS,
  VISIBLE_OUTREACH_PROJECT_TYPES,
  getOutreachProjectTypeConfig,
  isOutreachProjectTypeAvailable,
} from './outreach-projects.ts';

test('idea validation is the only active v1 outreach project type', () => {
  assert.deepEqual(ACTIVE_OUTREACH_PROJECT_TYPES, ['idea_validation']);
  assert.equal(OUTREACH_PROJECT_TYPE_CONFIGS.idea_validation.label, 'Idea Validation');
  assert.equal(isOutreachProjectTypeAvailable('idea_validation'), true);
});

test('future outreach project types are visible but coming soon', () => {
  assert.equal(VISIBLE_OUTREACH_PROJECT_TYPES.includes('customer_acquisition'), true);
  assert.equal(VISIBLE_OUTREACH_PROJECT_TYPES.includes('press_creator'), true);
  assert.equal(getOutreachProjectTypeConfig('investor').availability, 'coming_soon');
  assert.equal(isOutreachProjectTypeAvailable('investor'), false);
  assert.equal(isOutreachProjectTypeAvailable('investor', 'coming_soon'), true);
});

test('unknown outreach project type falls back to idea validation metadata', () => {
  assert.equal(getOutreachProjectTypeConfig('unknown').type, 'idea_validation');
});
