import { SectionPlaceholder } from '@/components/dashboard/SectionPlaceholder';

export default async function BoardPage() {
  return (
    <SectionPlaceholder
      eyebrow="Board"
      title="Pipeline management is coming next."
      description="The board is meant to give you a quick visual pass over outreach, scheduling, and follow-up so conversations do not disappear into a spreadsheet."
      bullets={[
        'Drag people between stages like bookmarked, contacted, and scheduled',
        'Spot stale follow-ups and gaps in persona coverage',
        'Keep outreach and interview prep connected to execution',
      ]}
    />
  );
}
