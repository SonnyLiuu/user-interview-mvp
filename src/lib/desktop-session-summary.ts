export type DesktopSessionTopicInput = {
  id?: string;
  label?: string;
  checked?: boolean;
  checkedBy?: string;
  checkedAt?: string;
  evidence?: string;
  manualOverride?: boolean;
};

export function buildDesktopSessionTopicSummary(topics: DesktopSessionTopicInput[]) {
  const checked = topics.filter((topic) => topic.checked);
  const unchecked = topics.filter((topic) => !topic.checked);
  const lines = [
    `Checked topics (${checked.length}/${topics.length}):`,
    ...(checked.length ? checked.map((topic) => `- ${topic.label ?? ''}`) : ['- None']),
    '',
    `Unchecked topics (${unchecked.length}/${topics.length}):`,
    ...(unchecked.length ? unchecked.map((topic) => `- ${topic.label ?? ''}`) : ['- None']),
  ];
  return lines.join('\n');
}

export function buildDesktopSessionNotesRaw(
  _topics: DesktopSessionTopicInput[],
  userNotes: string | null | undefined,
) {
  const trimmedNotes = userNotes?.trim() ?? '';
  return trimmedNotes;
}
