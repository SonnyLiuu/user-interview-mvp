import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopSessionNotesRaw,
  buildDesktopSessionTopicSummary,
} from './desktop-session-summary.ts';

test('summarizes checked and unchecked desktop call topics', () => {
  assert.equal(
    buildDesktopSessionTopicSummary([
      { label: 'Confirm the pain is recent', checked: true },
      { label: 'Ask for workflow details', checked: false },
      { label: 'Listen for intro offer' },
    ]),
    [
      'Checked topics (1/3):',
      '- Confirm the pain is recent',
      '',
      'Unchecked topics (2/3):',
      '- Ask for workflow details',
      '- Listen for intro offer',
    ].join('\n'),
  );
});

test('desktop session notes append user notes only when present', () => {
  const topics = [{ label: 'Ask about workaround', checked: true }];

  assert.equal(
    buildDesktopSessionNotesRaw(topics, '  Follow up next week.  '),
    [
      'Checked topics (1/1):',
      '- Ask about workaround',
      '',
      'Unchecked topics (0/1):',
      '- None',
      '',
      'Notes:',
      'Follow up next week.',
    ].join('\n'),
  );
  assert.equal(
    buildDesktopSessionNotesRaw([], '   '),
    [
      'Checked topics (0/0):',
      '- None',
      '',
      'Unchecked topics (0/0):',
      '- None',
    ].join('\n'),
  );
});
