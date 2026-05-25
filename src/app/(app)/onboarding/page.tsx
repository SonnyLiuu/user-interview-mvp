import { listProjects } from '@/lib/backend-server';
import OnboardingForm from './OnboardingForm';
import styles from './onboarding.module.css';

export default async function OnboardingPage() {
  const projects = await listProjects();
  const existingProjectNames = projects.map((project) => project.name);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>New project</p>
        <h1 className={styles.heading}>What are you working on?</h1>
        <p className={styles.sub}>Choose a project type and give it a name. You can always change the name later.</p>
        <OnboardingForm existingProjectNames={existingProjectNames} />
      </div>
    </div>
  );
}
