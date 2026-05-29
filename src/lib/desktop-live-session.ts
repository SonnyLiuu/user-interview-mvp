export function normalizeFoundryBaseUrl(raw: string | null | undefined) {
  const trimmed = (raw || 'http://127.0.0.1:8001').trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}
