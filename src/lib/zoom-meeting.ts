export function normalizeZoomMeetingIdentifier(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  let candidate = raw;
  try {
    const url = new URL(raw);
      const pathMatch = url.pathname.match(/\/(?:j|join|wc\/join|my)\/([^/?#]+)/i);
    candidate = pathMatch?.[1] || url.searchParams.get('confno') || url.searchParams.get('meetingId') || raw;
  } catch {
    candidate = raw;
  }

  const decoded = decodeURIComponent(candidate).trim();
  const numeric = decoded.replace(/\s+/g, '').replace(/-/g, '');
  if (/^\d{9,12}$/.test(numeric)) return numeric;

  return decoded || null;
}
