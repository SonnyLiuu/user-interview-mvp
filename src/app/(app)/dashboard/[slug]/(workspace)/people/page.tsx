import { SectionPlaceholder } from '@/components/dashboard/SectionPlaceholder';

export default async function PeoplePage() {
  return (
    <SectionPlaceholder
      eyebrow="People"
      title="Research targets will live here."
      description="This area is reserved for the people pipeline: who to talk to, why they matter, and where they are in your discovery process."
      bullets={[
        'Import or paste profiles, links, and lightweight notes',
        'Score people against the current project hypothesis',
        'Track status from bookmarked to contacted to completed',
      ]}
    />
  );
}
