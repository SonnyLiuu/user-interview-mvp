export type CrawlResult = {
  url: string;
  title?: string;
  content: string;
  links?: string[];
};

export type CrawlDepth = 'quick' | 'deep';

export class FirecrawlError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
    this.name = 'FirecrawlError';
  }
}

// Scrape a single URL via Firecrawl and return markdown content + outbound links.
async function scrapeUrl(url: string, apiKey: string): Promise<CrawlResult> {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FirecrawlError(`Firecrawl scrape failed (${res.status}): ${body}`, url);
  }

  const json = await res.json();
  const data = json.data ?? json;

  return {
    url,
    title: data.metadata?.title,
    content: data.markdown ?? data.content ?? '',
    links: data.links ?? [],
  };
}

// Pick up to maxLinks outbound links that look like personal/professional pages
// (portfolios, GitHub, LinkedIn, company pages) — skip social noise and tracking URLs.
function selectRelevantLinks(links: string[], origin: string, maxLinks: number): string[] {
  const originHost = new URL(origin).hostname;
  const skipPatterns = /\.(png|jpg|jpeg|gif|svg|pdf|zip|mp4|css|js)$|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|mailto:|tel:/i;
  const preferPatterns = /github\.com|linkedin\.com|substack\.com|medium\.com/i;

  const candidates = links
    .map(l => { try { return new URL(l, origin).href; } catch { return null; } })
    .filter((l): l is string => l !== null && !skipPatterns.test(l))
    .filter(l => new URL(l).hostname !== originHost);

  const preferred = candidates.filter(l => preferPatterns.test(l));
  const rest = candidates.filter(l => !preferPatterns.test(l));

  return [...new Set([...preferred, ...rest])].slice(0, maxLinks);
}

/**
 * Crawl one or more URLs for a person.
 *
 * - quick: scrapes each submitted URL, no link following
 * - deep:  scrapes each submitted URL, then follows up to 2–3 relevant outbound
 *          links found on the first page (3–4 total pages per person)
 *
 * Returns consolidated text for all pages crawled.
 */
export async function crawlUrls(urls: string[], depth: CrawlDepth = 'deep'): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set');

  const results: CrawlResult[] = [];
  const visited = new Set<string>();

  for (const url of urls) {
    if (visited.has(url)) continue;
    visited.add(url);

    const primary = await scrapeUrl(url, apiKey);
    results.push(primary);

    if (depth === 'deep' && primary.links?.length) {
      const followLinks = selectRelevantLinks(primary.links, url, 2);
      for (const link of followLinks) {
        if (visited.has(link)) continue;
        visited.add(link);
        try {
          const secondary = await scrapeUrl(link, apiKey);
          results.push(secondary);
        } catch {
          // Non-fatal — best effort on secondary pages
        }
      }
    }
  }

  // Consolidate all pages into a single text block for the AI
  return results
    .map(r => `## ${r.title ?? r.url}\nSource: ${r.url}\n\n${r.content}`)
    .join('\n\n---\n\n');
}
