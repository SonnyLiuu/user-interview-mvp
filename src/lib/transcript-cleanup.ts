const DIAGNOSTIC_LINE_PATTERNS = [
  /^(?:[A-Za-z]+:\s*)?(?:Realtime|REST|Transcription|Desktop audio|Sent transcription|Starting (?:source transcription|realtime|REST|mock realtime)|Signal auto-detected|Emitting topic_checked|Transcript turn)\b.*\bsession=[0-9a-f-]{8,}/i,
  /^(?:[A-Za-z]+:\s*)?INFO:\s+\d{1,3}(?:\.\d{1,3}){3}:\d+\s+-\s+".*?\/v1\/desktop\/live-sessions\/.*/i,
  /^(?:[A-Za-z]+:\s*)?HTTP\/\d(?:\.\d)?"?\s+\d{3}\s+\w+$/i,
];

function isDiagnosticTranscriptLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return DIAGNOSTIC_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function cleanTranscriptHistoryContent(value: string | null | undefined) {
  if (!value) return '';
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !isDiagnosticTranscriptLine(line))
    .join('\n')
    .trim();
}
