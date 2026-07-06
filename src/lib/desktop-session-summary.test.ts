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

test('desktop session notes save user notes without checklist topics', () => {
  const topics = [{ label: 'Ask about workaround', checked: true }];

  assert.equal(
    buildDesktopSessionNotesRaw(topics, '  Follow up next week.  '),
    'Follow up next week.',
  );
  assert.equal(buildDesktopSessionNotesRaw([], '   '), '');
});
