import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanTranscriptHistoryContent } from './transcript-cleanup.ts';

test('removes live-session diagnostics from transcript history content', () => {
  const dirty = [
    'Realtime requested tool session=38a76cd6-a322-48e4-a528-9eb71cbc294a name=mark_item_covered',
    'Desktop audio websocket received session=38a76cd6-a322-48e4-a528-9eb71cbc294a source=mic chunks=17500 bytes=8399982',
    'INFO:     127.0.0.1:61285 - "GET /v1/desktop/live-sessions/38a76cd6-a322-48e4-a528-9eb71cbc294a HTTP/1.1" 200 OK',
    'HTTP/1.1" 200 OK',
    'Founder: What is painful about the current workflow?',
    'Interviewee: We export to spreadsheets every Friday.',
  ].join('\n');

  assert.equal(
    cleanTranscriptHistoryContent(dirty),
    [
      'Founder: What is painful about the current workflow?',
      'Interviewee: We export to spreadsheets every Friday.',
    ].join('\n'),
  );
});

test('does not remove ordinary transcript lines that mention logging concepts', () => {
  assert.equal(
    cleanTranscriptHistoryContent('Interviewee: We review INFO logs when incidents happen.'),
    'Interviewee: We review INFO logs when incidents happen.',
  );
});
