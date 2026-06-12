import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGlobalPersonCaptureInput,
  chooseGlobalPersonMatch,
  mergeTagSets,
  normalizeGlobalTags,
  normalizeIdentityKey,
  normalizePublicUrl,
} from './global-people-core.ts';
import type { GlobalPerson } from './db/schema.ts';

function globalPerson(id: string): GlobalPerson {
  return {
    id,
    name_key: 'jane_doe',
    display_name: 'Jane Doe',
    company_key: null,
    display_company: null,
    title_key: null,
    display_title: null,
    linkedin_key: null,
    website_key: null,
    role_tags: [],
    market_tags: [],
    seniority_tags: [],
    project_fit_tags: [],
    learning_value_tags: [],
    created_at: new Date(0),
    updated_at: new Date(0),
    last_seen_at: new Date(0),
  };
}

test('normalizes public URLs for global identity and source storage', () => {
  assert.equal(
    normalizePublicUrl('HTTPS://www.linkedin.com/in/Jane-Doe/?utm_source=test#about'),
    'https://www.linkedin.com/in/jane-doe',
  );
  assert.equal(
    normalizePublicUrl('https://Example.com/Profile/?utm_campaign=x&b=2&a=1#section'),
    'https://example.com/Profile/?a=1&b=2',
  );
});

test('normalizes identity keys without keeping display punctuation', () => {
  assert.equal(normalizeIdentityKey('  Jane Dœ, PhD  '), 'jane_doe_phd');
});

test('global tags keep only allowlisted unique values', () => {
  assert.deepEqual(
    normalizeGlobalTags({
      role_tags: ['Founder', 'founder', 'wizard'],
      market_tags: ['AI', 'unknown_market'],
      seniority_tags: ['founder-ceo'],
      project_fit_tags: ['idea validation fit'],
      learning_value_tags: ['owns_workflow', 'owns_workflow'],
    }),
    {
      role_tags: ['founder'],
      market_tags: ['ai'],
      seniority_tags: ['founder_ceo'],
      project_fit_tags: ['idea_validation_fit'],
      learning_value_tags: ['owns_workflow'],
    },
  );
});

test('dedupe priority prefers linkedin, then website/name, then name/company/title', () => {
  assert.equal(
    chooseGlobalPersonMatch({
      byLinkedin: globalPerson('linkedin'),
      byWebsiteName: globalPerson('website'),
      byNameCompanyTitle: globalPerson('title'),
    }).globalPerson?.id,
    'linkedin',
  );
  assert.deepEqual(
    chooseGlobalPersonMatch({
      byWebsiteName: globalPerson('website'),
      byNameCompanyTitle: globalPerson('title'),
    }),
    { globalPerson: globalPerson('website'), method: 'website_name', confidence: 0.92 },
  );
  assert.equal(chooseGlobalPersonMatch({}).method, 'new');
});

test('merges global tag sets without duplicates or unknown values', () => {
  assert.deepEqual(
    mergeTagSets(
      { role_tags: ['founder'], market_tags: ['ai'] },
      { role_tags: ['founder', 'operator'], market_tags: ['fake_market'], project_fit_tags: ['idea_validation_fit'] },
    ),
    {
      role_tags: ['founder', 'operator'],
      market_tags: ['ai'],
      seniority_tags: [],
      project_fit_tags: ['idea_validation_fit'],
      learning_value_tags: [],
    },
  );
});

test('builds global capture input without email, pasted text, or crawled content', () => {
  const input = buildGlobalPersonCaptureInput({
    person: {
      id: 'person-1',
      project_id: 'project-1',
      name: 'Placeholder',
      title: 'Head of Product',
      company: 'Acme',
      source_urls: ['https://example.com/profile?utm_source=x'],
      discovered_urls: [
        {
          url: 'https://github.com/janedoe',
          kind: 'github',
          confidence: 'high',
          evidence: 'Profile text',
          crawl_status: 'included',
          added_at: '2026-06-12T00:00:00.000Z',
        },
      ],
      raw_pasted_text: 'secret pasted profile',
      crawled_content: { content: 'secret crawled content' },
    } as never,
    analysis: {
      name: 'Jane Doe',
      title: 'VP Product',
      company: 'Acme Corp',
      contact_info: {
        email: 'jane@example.com',
        linkedin: 'https://linkedin.com/in/JaneDoe?utm_source=x',
        website: 'https://janedoe.com',
      },
      global_tags: {
        role_tags: ['product_leader'],
        market_tags: ['b2b'],
      },
    },
  });

  assert.equal(input?.displayName, 'Jane Doe');
  assert.equal(input?.linkedinKey, 'https://www.linkedin.com/in/janedoe');
  assert.deepEqual(input?.tags.role_tags, ['product_leader']);
  assert.deepEqual(input?.tags.market_tags, ['b2b']);
  assert.equal(JSON.stringify(input).includes('jane@example.com'), false);
  assert.equal(JSON.stringify(input).includes('secret pasted profile'), false);
  assert.equal(JSON.stringify(input).includes('secret crawled content'), false);
});
