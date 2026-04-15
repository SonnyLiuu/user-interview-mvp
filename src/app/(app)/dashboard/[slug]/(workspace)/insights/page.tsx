import { SectionPlaceholder } from '@/components/dashboard/SectionPlaceholder';

export default async function InsightsPage() {
  return (
    <SectionPlaceholder
      eyebrow="Insights"
      title="Learning synthesis will show up here."
      description="Insights is where the app will connect your conversations back to your assumptions, showing what is strengthening, weakening, or still unclear."
      bullets={[
        'Aggregate recurring themes across notes and transcripts',
        'Show which assumptions are gaining evidence or falling apart',
        'Recommend next interviews based on unresolved questions',
      ]}
    />
  );
}
