import { getAuthenticatedUserId } from '@/lib/auth';
import { listOwnedProjects } from '@/lib/projects';
import OnboardingForm from './OnboardingForm';
import styles from './onboarding.module.css';

export default async function OnboardingPage() {
  const userId = await getAuthenticatedUserId();
  const projects = await listOwnedProjects(userId);
  const existingProjectNames = projects.map((project) => project.name);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>New project</p>
        <h1 className={styles.heading}>What are you working on?</h1>
        <p className={styles.sub}>Give your startup idea a name. You can always change it later.</p>
        <OnboardingForm existingProjectNames={existingProjectNames} />
      </div>
    </div>
  );
}
