import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_OUTREACH_PROJECT_TYPES,
  OUTREACH_PROJECT_TYPE_CONFIGS,
  VISIBLE_OUTREACH_PROJECT_TYPES,
  getOutreachProjectTypeConfig,
  isOutreachProjectTypeAvailable,
} from './outreach-projects.ts';

test('information discovery is the only active v1 outreach project type', () => {
  assert.deepEqual(ACTIVE_OUTREACH_PROJECT_TYPES, ['information_discovery']);
  assert.equal(OUTREACH_PROJECT_TYPE_CONFIGS.information_discovery.label, 'Information Discovery');
  assert.equal(isOutreachProjectTypeAvailable('information_discovery'), true);
});

test('future outreach project types are visible but coming soon', () => {
  assert.equal(VISIBLE_OUTREACH_PROJECT_TYPES.includes('customer_acquisition'), true);
  assert.equal(VISIBLE_OUTREACH_PROJECT_TYPES.includes('press_creator'), true);
  assert.equal(getOutreachProjectTypeConfig('investor').availability, 'coming_soon');
  assert.equal(isOutreachProjectTypeAvailable('investor'), false);
  assert.equal(isOutreachProjectTypeAvailable('investor', 'coming_soon'), true);
});

test('unknown outreach project type falls back to information discovery metadata', () => {
  assert.equal(getOutreachProjectTypeConfig('unknown').type, 'information_discovery');
});
