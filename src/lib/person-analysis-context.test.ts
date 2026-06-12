import assert from 'node:assert/strict';
import test from 'node:test';

import { foundationToAnalysisContext, sanitizeIdentityField } from './person-analysis-context.ts';
import type { Foundation } from './backend-types.ts';

test('sanitizeIdentityField rejects profile dump fragments', () => {
  assert.equal(sanitizeIdentityField('Head of Product'), 'Head of Product');
  assert.equal(sanitizeIdentityField('Follow Message More Contact info'), null);
  assert.equal(sanitizeIdentityField('x'.repeat(141)), null);
});

test('startup analysis context includes idea validation brief fields and match profile', () => {
  const foundation: Foundation = {
    summary: 'AI workflow tool',
    targetUser: 'Operations leaders',
    painPoint: 'Manual reporting',
    valueProp: 'Automates weekly reporting',
    idealPeopleTypes: ['Ops managers'],
    desiredOutcome: 'Validate urgency',
    learningGoals: ['Understand current workaround'],
    messageBoundaries: ['Do not sell'],
  };

  const context = foundationToAnalysisContext(foundation, 'startup', {
    version: 3,
    profile_json: {
      matchRubric: 'Prioritize people who own reporting',
      lowFitSignals: ['No operations exposure'],
      positivePatterns: ['Owns reporting cadence'],
      negativePatterns: ['Pure investor background'],
    },
  });

  assert.equal(context.project_type, 'startup');
  assert.equal(context.target_customer, 'Operations leaders');
  assert.equal(context.match_profile_version, 3);
  assert.match(context.idea_summary ?? '', /Validate urgency/);
  assert.deepEqual(context.low_fit_signals, ['No operations exposure']);
  assert.deepEqual(context.positive_patterns, ['Owns reporting cadence']);
});

test('networking analysis context prefers explicit foundation targeting', () => {
  const foundation: Foundation = {
    outreachGoal: 'Meet conference speakers',
    recipients: 'AI infrastructure speakers',
    sharedContext: 'Same conference',
    desiredOutcome: 'Schedule coffee',
    senderContext: 'Presenting a related talk',
    priorityRecipientTypes: ['Panel speakers'],
    lowFitSignals: ['No conference overlap'],
  };

  const context = foundationToAnalysisContext(foundation, 'networking', {
    version: 2,
    profile_json: {
      priorityRecipientTypes: ['Fallback recipient'],
      lowFitSignals: ['Fallback low fit'],
    },
  });

  assert.equal(context.project_type, 'networking');
  assert.equal(context.target_customer, 'AI infrastructure speakers');
  assert.deepEqual(context.most_promising_avenues, ['Panel speakers']);
  assert.deepEqual(context.low_fit_signals, ['No conference overlap']);
  assert.match(context.idea_summary ?? '', /Presenting a related talk/);
});
