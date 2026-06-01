import OnboardingForm from './OnboardingForm';
import styles from './onboarding.module.css';

export default function OnboardingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Startup onboarding</p>
        <h1 className={styles.heading}>Let&apos;s understand the startup first.</h1>
        <p className={styles.sub}>Answer a few focused questions so we can shape your startup foundation and recommend the right first outreach project.</p>
        <OnboardingForm />
      </div>
    </div>
  );
}
