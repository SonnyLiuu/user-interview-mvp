import 'server-only';
import OpenAI from 'openai';
import { env } from '@/lib/server-env';

export type DiscoveryKind = 'github' | 'website' | 'blog';
export type DiscoveryConfidence = 'high' | 'medium';

export type DiscoveredCandidate = {
  url: string;
  kind: DiscoveryKind;
  confidence: DiscoveryConfidence;
  evidence: string;
};

const MAX_DISCOVERIES = 5;
const MAX_PASTED_TEXT_CHARS = 10_000;

const DISCOVERY_INSTRUCTIONS = `You help a researcher find public web sources for a specific person.

You will be given LinkedIn profile text the user pasted. Use web search to find this person's:
- GitHub profile (github.com/<username>) — only if they are technical
- Personal website or portfolio (a domain they own — not a company page)
- Substack, Medium, or other writing platform they publish on

Common-name false positives are the biggest failure mode. Only return a URL if you can verify it matches the person on at least two of these signals:
- Full name match
- Current employer / company match
- Location, university, or other unique biographical detail visible in the source
- Current role or job title match

Output format — return ONLY a JSON array, no prose, no code fences. At most ${MAX_DISCOVERIES} items, only "high" or "medium" confidence:
[
  {
    "url": "https://github.com/janedoe",
    "kind": "github",
    "confidence": "high",
    "evidence": "GitHub bio says 'Eng @ Acme'; LinkedIn lists Acme as current employer; both mention Stanford CS."
  }
]

If no high- or medium-confidence matches exist, return [].`;

function buildPrompt(pastedText: string, alreadyHaveUrls: string[]): string {
  const truncated = pastedText.length > MAX_PASTED_TEXT_CHARS
    ? `${pastedText.slice(0, MAX_PASTED_TEXT_CHARS)}\n\n[truncated]`
    : pastedText;
  const exclude = alreadyHaveUrls.length
    ? `\n\nThe user already added these URLs — do not return duplicates:\n${alreadyHaveUrls.join('\n')}`
    : '';
  return `${DISCOVERY_INSTRUCTIONS}\n\n--- LINKEDIN PROFILE TEXT ---\n${truncated}${exclude}`;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateCandidate(raw: unknown): DiscoveredCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const url = typeof obj.url === 'string' ? obj.url.trim() : '';
  const kind = obj.kind;
  const confidence = obj.confidence;
  const evidence = typeof obj.evidence === 'string' ? obj.evidence.trim() : '';
  if (!isHttpUrl(url)) return null;
  if (kind !== 'github' && kind !== 'website' && kind !== 'blog') return null;
  if (confidence !== 'high' && confidence !== 'medium') return null;
  if (!evidence) return null;
  return { url, kind, confidence, evidence };
}

function parseCandidates(rawText: string): DiscoveredCandidate[] {
  if (!rawText) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: DiscoveredCandidate[] = [];
  for (const item of parsed) {
    const candidate = validateCandidate(item);
    if (!candidate) continue;
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= MAX_DISCOVERIES) break;
  }
  return out;
}

async function discoverWithOpenAI(prompt: string): Promise<DiscoveredCandidate[]> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return [];
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_WEB_SEARCH_MODEL?.trim() || env.OPENAI_MODEL;
  try {
    const response = await client.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'auto',
      input: prompt,
    });
    const text = (response as { output_text?: string }).output_text ?? '';
    return parseCandidates(text);
  } catch (err) {
    console.warn('[discover-person-links] OpenAI web search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

type GeminiPart = { text?: string };
type GeminiCandidate = { content?: { parts?: GeminiPart[] } };
type GeminiResponse = { candidates?: GeminiCandidate[] };

async function discoverWithGemini(prompt: string): Promise<DiscoveredCandidate[]> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const model = process.env.GEMINI_WEB_SEARCH_MODEL?.trim() || env.GEMINI_MODEL;
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!res.ok) {
      console.warn(`[discover-person-links] Gemini web search HTTP ${res.status}`);
      return [];
    }
    const payload = (await res.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return parseCandidates(text);
  } catch (err) {
    console.warn('[discover-person-links] Gemini web search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function discoverPersonLinks(
  pastedText: string,
  alreadyHaveUrls: string[] = [],
): Promise<DiscoveredCandidate[]> {
  const trimmed = (pastedText ?? '').trim();
  if (!trimmed) return [];
  const prompt = buildPrompt(trimmed, alreadyHaveUrls);
  if (env.OPENAI_API_KEY) return discoverWithOpenAI(prompt);
  if (env.GEMINI_API_KEY) return discoverWithGemini(prompt);
  return [];
}
