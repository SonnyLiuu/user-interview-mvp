import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePersonSources, discoveredSourceLabel, normalizeUrlKey } from './person-sources.ts';

test('derivePersonSources prefers analysis contact info over source urls', () => {
  const sources = derivePersonSources(
    {
      source_urls: ['https://linkedin.com/in/source-profile', 'https://example.com'],
      additional_context: [],
      raw_pasted_text: null,
    },
    {
      contact_info: {
        email: 'founder@example.com',
        linkedin: 'https://linkedin.com/in/analysis-profile',
        website: 'https://analysis.example.com',
      },
    },
  );

  assert.equal(sources.email, 'founder@example.com');
  assert.equal(sources.linkedin, 'https://linkedin.com/in/analysis-profile');
  assert.equal(sources.website, 'https://analysis.example.com');
});

test('derivePersonSources detects pasted LinkedIn text without a URL', () => {
  const sources = derivePersonSources(
    {
      source_urls: [],
      additional_context: [],
      raw_pasted_text: "View Jane's full profile\nExperience\nConnections",
    },
    null,
  );

  assert.equal(sources.linkedin, undefined);
  assert.equal(sources.linkedinPastedNoUrl, true);
});

test('normalizeUrlKey removes hashes, trailing slash, and casing differences', () => {
  assert.equal(
    normalizeUrlKey('https://Example.com/Profile/#section'),
    'https://example.com/profile',
  );
});

test('discoveredSourceLabel formats known source kinds', () => {
  assert.equal(
    discoveredSourceLabel({
      url: 'https://github.com/acme',
      kind: 'github',
      confidence: 'high',
      evidence: 'Mentioned in profile',
      crawl_status: 'included',
      added_at: '2026-06-02T00:00:00.000Z',
    }),
    'GitHub',
  );
});
