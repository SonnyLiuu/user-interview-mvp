import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_INSIGHT_SCHEMA_VERSION,
  analyzeTranscriptTechnique,
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

  assert.match(content.overviewOpener, /interviews so far/i);
  assert.equal(content.learningSummary.callsAnalyzed, 2);
  assert.equal(content.learningSummary.evidenceLevel, 'emerging');
  assert.equal(content.recurringThemes[0].supportingQuotes[0].personName, 'Ari');
  assert.equal(content.assumptionTracker[0].assumption, 'Teams have a repeated handoff problem.');
  assert.equal(content.assumptionTracker[0].status, 'unclear');
  assert.equal(content.schemaVersion, CURRENT_INSIGHT_SCHEMA_VERSION);
  assert.equal(content.interviewCoach.reliability, 'low');
  assert.equal('practiceGoal' in content.interviewCoach, false);
  assert.equal('practiceQuestions' in content.interviewCoach, false);
});

test('freshness rejects cached insights without current coaching schema', () => {
  const generatedAt = new Date('2026-05-29T12:00:00.000Z');

  assert.equal(
    isInsightFresh(
      {
        calls_analyzed: 2,
        generated_at: generatedAt,
        content: {
          learningSummary: { callsAnalyzed: 2 },
          recurringThemes: [],
          assumptionTracker: [],
        },
      },
      { interviewCount: 2, latestDataAt: new Date('2026-05-29T11:00:00.000Z') },
    ),
    false,
  );

  const currentContent = normalizeInsightContent(null, { callsAnalyzed: 2 });
  assert.equal(
    isInsightFresh(
      { calls_analyzed: 2, generated_at: generatedAt, content: currentContent },
      { interviewCount: 2, latestDataAt: new Date('2026-05-29T11:00:00.000Z') },
    ),
    true,
  );
});

test('flags leading product-validation questions in transcripts', () => {
  const review = analyzeTranscriptTechnique(`
Founder: So how much time do you typically spend researching a person before you write your first outreach message?
Interviewee: I usually spend around 15 to 30 minutes to scrape their public profile, like LinkedIn website, blogs.
Founder: Have you ever actually just given up on reaching out to a person because doing that sort of research has taken too long?
Interviewee: Yeah, sometimes it's very time consuming. If I spend too much time, like three or four hours, I might just stop there to work on something else.
Founder: So if somebody came up with a tool that helps automate some parts of their research while keeping your message personable, would that help you with that problem?
Interviewee: Sure it would help.
  `);

  assert.equal(review.questionFlags.length, 1);
  assert.equal(review.questionFlags[0].severity, 'problem');
  assert.match(review.questionFlags[0].issue, /Leading solution-validation/);
  assert.match(review.questionFlags[0].suggestion, /last time/i);
  assert.ok(review.evidenceSignals.some((signal) => signal.includes('time consuming')));
  assert.ok(review.weakEvidenceMoments.some((moment) => moment.quote.includes('Sure it would help')));
  assert.ok(review.missedProbes.some((probe) => probe.context.includes('time consuming')));
  assert.equal(review.reliability, 'low');
});

test('does not flag concrete past-behavior discovery questions', () => {
  const review = analyzeTranscriptTechnique(`
Founder: Tell me about the last time you researched someone before sending outreach.
Interviewee: Yesterday I spent 45 minutes reading LinkedIn, a personal site, and two blog posts.
Founder: What did you do after that took longer than expected?
Interviewee: I skipped the person and moved on to engineering work.
  `);

  assert.equal(review.questionFlags.length, 0);
  assert.ok(review.strongEvidenceMoments.length >= 2);
  assert.notEqual(review.reliability, 'low');
});

test('flags hypothetical future-intent questions without a product pitch', () => {
  const review = analyzeTranscriptTechnique(`
Founder: Would you pay for something that made outbound research faster?
Interviewee: Maybe, if it worked well.
  `);

  assert.equal(review.questionFlags.length, 1);
  assert.match(review.questionFlags[0].issue, /Hypothetical validation/);
  assert.ok(review.weakEvidenceMoments.some((moment) => moment.quote.includes('Maybe')));
});
