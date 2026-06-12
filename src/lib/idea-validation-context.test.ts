import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyIdeaValidationBrief,
  normalizeIdeaValidationBrief,
} from './idea-validation-context-core.ts';

test('normalizes and applies idea validation brief to startup foundation', () => {
  const brief = normalizeIdeaValidationBrief({
    desiredOutcome: '  Validate urgency  ',
    targetPeople: ['Ops leaders', 'Ops leaders', ' Finance operators '],
    learningGoals: ['Understand workarounds'],
    assumptionsToTest: ['Manual reporting is painful'],
    conversationBoundaries: ['Do not pitch'],
  });

  const foundation = applyIdeaValidationBrief({
    summary: 'Workflow automation',
    targetUser: 'Operations teams',
    painPoint: 'Manual reporting',
    valueProp: 'Saves time',
    idealPeopleTypes: ['Ops managers'],
  }, brief);

  assert.equal(foundation.desiredOutcome, 'Validate urgency');
  assert.deepEqual(foundation.idealPeopleTypes, ['Ops leaders', 'Finance operators']);
  assert.deepEqual(foundation.keyAssumptions, ['Manual reporting is painful']);
  assert.deepEqual(foundation.messageBoundaries, ['Do not pitch']);
  assert.equal(foundation.activeOutreachProject?.type, 'idea_validation');
});
