import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasInterviewData,
  isInsightFresh,
  normalizeInsightContent,
} from './insights-core.ts';

test('insights stay locked until interview data exists', () => {
  assert.equal(hasInterviewData({ completedInteractionCount: 0, transcriptCount: 0 }), false);
  assert.equal(hasInterviewData({ completedInteractionCount: 1, transcriptCount: 0 }), true);
  assert.equal(hasInterviewData({ completedInteractionCount: 0, transcriptCount: 1 }), true);
});

test('insight freshness uses calls analyzed and latest interview data timestamp', () => {
  const generatedAt = new Date('2026-05-29T12:00:00.000Z');

  assert.equal(
    isInsightFresh(
      { calls_analyzed: 2, generated_at: generatedAt },
      { interviewCount: 2, latestDataAt: new Date('2026-05-29T11:00:00.000Z') },
    ),
    true,
  );
  assert.equal(
    isInsightFresh(
      { calls_analyzed: 2, generated_at: generatedAt },
      { interviewCount: 3, latestDataAt: new Date('2026-05-29T11:00:00.000Z') },
    ),
    false,
  );
  assert.equal(
    isInsightFresh(
      { calls_analyzed: 2, generated_at: generatedAt },
      { interviewCount: 2, latestDataAt: new Date('2026-05-29T13:00:00.000Z') },
    ),
    false,
  );
});

test('normalizes generated insight payload with fallback sections', () => {
  const content = normalizeInsightContent(
    {
      learningSummary: {
        headline: ' Workflow pain is real ',
        callsAnalyzed: 2,
      },
      recurringThemes: [{
        theme: 'Manual handoffs',
        description: 'Interviewees keep describing manual status updates.',
        callCount: 2,
        evidenceStrength: 'emerging',
        supportingQuotes: [{ personName: 'Ari', quote: 'We copy it into a sheet.' }],
      }],
      assumptionTracker: [],
    },
    {
      callsAnalyzed: 2,
      assumptions: ['Teams have a repeated handoff problem.'],
    },
  );

  assert.equal(content.learningSummary.headline, 'Workflow pain is real');
  assert.equal(content.learningSummary.callsAnalyzed, 2);
  assert.equal(content.learningSummary.evidenceLevel, 'emerging');
  assert.equal(content.recurringThemes[0].supportingQuotes[0].personName, 'Ari');
  assert.equal(content.assumptionTracker[0].assumption, 'Teams have a repeated handoff problem.');
  assert.equal(content.assumptionTracker[0].status, 'unclear');
});
