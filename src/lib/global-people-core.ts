import type {
  DiscoveredUrl,
  GlobalPerson,
  GlobalPersonTags,
  Person,
  PersonAnalysis,
} from './db/schema.ts';

export type GlobalUrlKind = 'linkedin' | 'website' | 'github' | 'twitter_x' | 'blog' | 'article' | 'other';
export type GlobalMatchMethod = 'linkedin' | 'website_name' | 'name_company_title' | 'new';

export type GlobalPersonUrlInput = {
  url: string;
  normalizedUrl: string;
  kind: GlobalUrlKind;
};

export type GlobalPersonCaptureInput = {
  personId: string;
  projectId: string | null;
  displayName: string;
  nameKey: string;
  displayCompany: string | null;
  companyKey: string | null;
  displayTitle: string | null;
  titleKey: string | null;
  linkedinKey: string | null;
  websiteKey: string | null;
  tags: Required<GlobalPersonTags>;
  urls: GlobalPersonUrlInput[];
};

export type GlobalPersonMatch = {
  globalPerson: GlobalPerson | null;
  method: GlobalMatchMethod;
  confidence: number;
};

export type GlobalPersonMatchCandidates = {
  byLinkedin?: GlobalPerson | null;
  byWebsiteName?: GlobalPerson | null;
  byNameCompanyTitle?: GlobalPerson | null;
};

export const GLOBAL_TAG_ALLOWLISTS = {
  role_tags: [
    'founder',
    'former_founder',
    'operator',
    'product_leader',
    'engineer',
    'designer',
    'sales',
    'marketing',
    'customer_success',
    'investor',
    'advisor',
    'recruiter',
    'journalist',
    'creator',
    'buyer',
    'end_user',
    'domain_expert',
    'community_builder',
  ],
  market_tags: [
    'startup',
    'enterprise',
    'smb',
    'agency',
    'marketplace',
    'consumer',
    'b2b',
    'b2c',
    'devtools',
    'ai',
    'healthcare',
    'fintech',
    'edtech',
    'climate',
    'ecommerce',
    'real_estate',
    'legaltech',
    'productivity',
    'hr',
    'sales_tech',
  ],
  seniority_tags: [
    'individual_contributor',
    'manager',
    'director',
    'executive',
    'founder_ceo',
    'budget_owner',
    'technical_decision_maker',
    'economic_buyer',
    'influencer',
    'gatekeeper',
  ],
  project_fit_tags: [
    'idea_validation_fit',
    'customer_acquisition_fit',
    'beta_user_fit',
    'partnership_fit',
    'investor_fit',
    'recruiting_fit',
    'advisor_fit',
    'press_creator_fit',
  ],
  learning_value_tags: [
    'has_problem_experience',
    'owns_workflow',
    'buys_solutions',
    'evaluates_tools',
    'switched_recently',
    'tried_workarounds',
    'skeptical_user',
    'power_user',
    'adjacent_expert',
    'can_explain_market',
    'low_relevance',
    'too_far_removed',
  ],
} as const satisfies Record<keyof GlobalPersonTags, readonly string[]>;

type GlobalTagKey = keyof typeof GLOBAL_TAG_ALLOWLISTS;

const EMPTY_TAGS: Required<GlobalPersonTags> = {
  role_tags: [],
  market_tags: [],
  seniority_tags: [],
  project_fit_tags: [],
  learning_value_tags: [],
};

const URL_TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'ref',
  'ref_src',
]);

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function normalizeIdentityKey(value: unknown): string | null {
  const text = cleanText(value)
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
  return text || null;
}

function normalizeTag(value: unknown): string {
  return cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeTagArray(values: unknown, allowlist: readonly string[]): string[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(allowlist);
  const result: string[] = [];
  for (const value of values) {
    const tag = normalizeTag(value);
    if (!allowed.has(tag) || result.includes(tag)) continue;
    result.push(tag);
  }
  return result;
}

export function normalizeGlobalTags(tags: GlobalPersonTags | null | undefined): Required<GlobalPersonTags> {
  const normalized = { ...EMPTY_TAGS };
  for (const key of Object.keys(GLOBAL_TAG_ALLOWLISTS) as GlobalTagKey[]) {
    normalized[key] = normalizeTagArray(tags?.[key], GLOBAL_TAG_ALLOWLISTS[key]);
  }
  return normalized;
}

export function mergeTagSets(
  existing: GlobalPersonTags | null | undefined,
  incoming: GlobalPersonTags | null | undefined,
): Required<GlobalPersonTags> {
  const merged = { ...EMPTY_TAGS };
  const normalizedExisting = normalizeGlobalTags(existing);
  const normalizedIncoming = normalizeGlobalTags(incoming);
  for (const key of Object.keys(GLOBAL_TAG_ALLOWLISTS) as GlobalTagKey[]) {
    merged[key] = [...new Set([...normalizedExisting[key], ...normalizedIncoming[key]])];
  }
  return merged;
}

export function normalizePublicUrl(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;

  try {
    const parsed = new URL(text);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';

    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || URL_TRACKING_PARAMS.has(lower)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();

    const linkedinMatch = parsed.hostname.match(/(?:^|\.)linkedin\.com$/)
      && parsed.pathname.match(/^\/in\/([^/?#]+)/i);
    if (linkedinMatch) {
      return `https://www.linkedin.com/in/${linkedinMatch[1].toLowerCase()}`;
    }

    return parsed.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function urlKindFor(normalizedUrl: string): GlobalUrlKind {
  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host.endsWith('linkedin.com') && path.startsWith('/in/')) return 'linkedin';
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'twitter_x';
    if (path.includes('blog') || host.includes('medium.com') || host.includes('substack.com')) return 'blog';
    if (path.includes('article') || path.includes('news') || path.includes('press')) return 'article';
    return 'website';
  } catch {
    return 'other';
  }
}

function addUrl(
  urlsByKey: Map<string, GlobalPersonUrlInput>,
  url: unknown,
  forcedKind?: GlobalUrlKind,
) {
  const normalizedUrl = normalizePublicUrl(url);
  if (!normalizedUrl || urlsByKey.has(normalizedUrl)) return;
  urlsByKey.set(normalizedUrl, {
    url: cleanText(url),
    normalizedUrl,
    kind: forcedKind ?? urlKindFor(normalizedUrl),
  });
}

function discoveredUrlKind(discovered: DiscoveredUrl): GlobalUrlKind {
  if (discovered.kind === 'github') return 'github';
  if (discovered.kind === 'blog') return 'blog';
  return 'website';
}

function firstUrlOfKind(urls: GlobalPersonUrlInput[], kind: GlobalUrlKind) {
  return urls.find((url) => url.kind === kind)?.normalizedUrl ?? null;
}

function firstWebsiteKey(urls: GlobalPersonUrlInput[]) {
  return urls.find((url) => !['linkedin', 'twitter_x'].includes(url.kind))?.normalizedUrl ?? null;
}

export function buildGlobalPersonCaptureInput(args: {
  person: Pick<Person, 'id' | 'project_id' | 'name' | 'title' | 'company' | 'source_urls' | 'discovered_urls'>;
  analysis: PersonAnalysis;
}): GlobalPersonCaptureInput | null {
  const displayName = cleanText(args.analysis.name) || cleanText(args.person.name);
  const nameKey = normalizeIdentityKey(displayName);
  if (!displayName || !nameKey) return null;

  const displayCompany = cleanText(args.analysis.company) || cleanText(args.person.company) || null;
  const displayTitle = cleanText(args.analysis.title) || cleanText(args.person.title) || null;
  const urlsByKey = new Map<string, GlobalPersonUrlInput>();

  addUrl(urlsByKey, args.analysis.contact_info?.linkedin, 'linkedin');
  addUrl(urlsByKey, args.analysis.contact_info?.website, 'website');
  addUrl(urlsByKey, args.analysis.contact_info?.twitter, 'twitter_x');
  for (const url of args.person.source_urls ?? []) addUrl(urlsByKey, url);
  for (const discovered of args.person.discovered_urls ?? []) addUrl(urlsByKey, discovered.url, discoveredUrlKind(discovered));

  const urls = [...urlsByKey.values()];

  return {
    personId: args.person.id,
    projectId: args.person.project_id ?? null,
    displayName,
    nameKey,
    displayCompany,
    companyKey: normalizeIdentityKey(displayCompany),
    displayTitle,
    titleKey: normalizeIdentityKey(displayTitle),
    linkedinKey: firstUrlOfKind(urls, 'linkedin'),
    websiteKey: firstWebsiteKey(urls),
    tags: normalizeGlobalTags(args.analysis.global_tags),
    urls,
  };
}

function betterDisplayValue(existing: string | null | undefined, incoming: string | null | undefined) {
  const cleanIncoming = cleanText(incoming);
  if (!cleanIncoming) return existing ?? null;
  const cleanExisting = cleanText(existing);
  if (!cleanExisting || cleanIncoming.length > cleanExisting.length) return cleanIncoming;
  return cleanExisting;
}

export function mergedGlobalPersonFields(existing: GlobalPerson, input: GlobalPersonCaptureInput) {
  const tags = mergeTagSets(existing, input.tags);
  return {
    display_name: betterDisplayValue(existing.display_name, input.displayName) ?? input.displayName,
    display_company: betterDisplayValue(existing.display_company, input.displayCompany),
    display_title: betterDisplayValue(existing.display_title, input.displayTitle),
    company_key: existing.company_key ?? input.companyKey,
    title_key: existing.title_key ?? input.titleKey,
    linkedin_key: existing.linkedin_key ?? input.linkedinKey,
    website_key: existing.website_key ?? input.websiteKey,
    role_tags: tags.role_tags,
    market_tags: tags.market_tags,
    seniority_tags: tags.seniority_tags,
    project_fit_tags: tags.project_fit_tags,
    learning_value_tags: tags.learning_value_tags,
    updated_at: new Date(),
    last_seen_at: new Date(),
  };
}

export function chooseGlobalPersonMatch(candidates: GlobalPersonMatchCandidates): GlobalPersonMatch {
  if (candidates.byLinkedin) {
    return { globalPerson: candidates.byLinkedin, method: 'linkedin', confidence: 0.99 };
  }
  if (candidates.byWebsiteName) {
    return { globalPerson: candidates.byWebsiteName, method: 'website_name', confidence: 0.92 };
  }
  if (candidates.byNameCompanyTitle) {
    return { globalPerson: candidates.byNameCompanyTitle, method: 'name_company_title', confidence: 0.88 };
  }
  return { globalPerson: null, method: 'new', confidence: 1 };
}
