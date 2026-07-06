import OnboardingForm from './OnboardingForm';
import { newProjectOnboardingChatEnabled } from '@/lib/feature-flags';
import { listProjects } from '@/lib/backend-server';
import styles from './onboarding.module.css';

export default async function OnboardingPage() {
  const projects = newProjectOnboardingChatEnabled ? await listProjects() : [];
  const isFirstStartup = !projects.some((project) => project.slug !== null);
  return (
    <div className={styles.page}>
      <OnboardingForm
        onboardingChatEnabled={newProjectOnboardingChatEnabled}
        showIntroQuestions={isFirstStartup}
      />
    </div>
  );
}
