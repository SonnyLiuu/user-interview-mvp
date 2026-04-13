export interface CrawlResult {
  markdown: string;
  source: 'jina' | 'firecrawl';
  error?: string;
}

export async function crawl(url: string): Promise<CrawlResult> {
  // Try Jina first (free, no key required)
  try {
    const res = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'text/markdown' } });
    if (res.ok) {
      const text = await res.text();
      if (text.length >= 200) return { markdown: text, source: 'jina' };
    }
  } catch { /* fall through to Firecrawl */ }

  // Firecrawl fallback
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });
    const data = await res.json() as { data?: { markdown?: string } };
    return { markdown: data.data?.markdown ?? '', source: 'firecrawl' };
  } catch (err) {
    return {
      markdown: '',
      source: 'firecrawl',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
