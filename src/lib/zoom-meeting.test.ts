import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeZoomMeetingIdentifier } from './zoom-meeting.ts';

test('normalizes common Zoom meeting identifiers', () => {
  assert.equal(normalizeZoomMeetingIdentifier(' 123 456 7890 '), '1234567890');
  assert.equal(normalizeZoomMeetingIdentifier('123-456-7890'), '1234567890');
  assert.equal(
    normalizeZoomMeetingIdentifier('https://zoom.us/j/12345678901?pwd=secret'),
    '12345678901',
  );
  assert.equal(
    normalizeZoomMeetingIdentifier('https://example.zoom.us/wc/join/987654321'),
    '987654321',
  );
  assert.equal(
    normalizeZoomMeetingIdentifier('https://zoom.us/join/1234567890?pwd=secret'),
    '1234567890',
  );
  assert.equal(normalizeZoomMeetingIdentifier(''), null);
});
