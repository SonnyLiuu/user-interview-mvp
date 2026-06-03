import type { DiscoveredUrl, Person, PersonAnalysis } from '@/lib/db/schema';

const LINKEDIN_URL_RE = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s)]+/i;
const TWITTER_URL_RE = /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s)]+/i;

export type DerivedPersonSources = {
  email?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  linkedinPastedNoUrl: boolean;
};

type SourcePerson = Pick<Person, 'source_urls' | 'additional_context' | 'raw_pasted_text'>;
type SourceAnalysis = Pick<PersonAnalysis, 'contact_info'>;

function findUrl(re: RegExp, ...haystacks: (string | undefined | null)[]): string | undefined {
  for (const h of haystacks) {
    if (!h) continue;
    const m = h.match(re);
    if (m) return m[0];
  }
  return undefined;
}

function pickFromSourceUrls(sourceUrls: string[], predicate: (url: string) => boolean): string | undefined {
  return sourceUrls.find(predicate);
}

export function derivePersonSources(person: SourcePerson, analysis: SourceAnalysis | null): DerivedPersonSources {
  const contact = analysis?.contact_info ?? {};
  const sourceUrls = person.source_urls ?? [];
  const additionalContext = (person.additional_context ?? []).join('\n');
  const pastedText = person.raw_pasted_text ?? '';

  const linkedin =
    contact.linkedin ||
    pickFromSourceUrls(sourceUrls, (url) => /linkedin\.com\/in\//i.test(url)) ||
    findUrl(LINKEDIN_URL_RE, pastedText, additionalContext);

  const twitter =
    contact.twitter ||
    pickFromSourceUrls(sourceUrls, (url) => /(?:^|\/\/)(?:www\.)?(?:twitter|x)\.com\//i.test(url)) ||
    findUrl(TWITTER_URL_RE, pastedText, additionalContext);

  const website =
    contact.website ||
    pickFromSourceUrls(sourceUrls, (url) =>
      !/linkedin\.com/i.test(url) && !/(?:twitter|x)\.com/i.test(url)
    );

  // If text was pasted and looks LinkedIn-shaped but we still couldn't find a
  // URL, flag it so the UI can render "LinkedIn - URL not provided" instead of
  // pretending no profile exists.
  const haystack = `${pastedText}\n${additionalContext}`;
  const looksLikeLinkedIn =
    /linkedin/i.test(haystack) ||
    /\bView .+?'s full profile\b/i.test(haystack) ||
    (/\bConnections?\b/i.test(haystack) && /\bExperience\b/i.test(haystack));
  const linkedinPastedNoUrl = !linkedin && pastedText.trim().length > 0 && looksLikeLinkedIn;

  return {
    email: contact.email,
    linkedin,
    twitter,
    website,
    linkedinPastedNoUrl,
  };
}

export function normalizeUrlKey(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, '').toLowerCase();
  }
}

const DISCOVERED_KIND_LABEL: Record<DiscoveredUrl['kind'], string> = {
  github: 'GitHub',
  website: 'Website',
  blog: 'Blog',
};

export function discoveredSourceLabel(source: DiscoveredUrl): string {
  return `Auto-detected ${DISCOVERED_KIND_LABEL[source.kind] ?? source.kind}`;
}
