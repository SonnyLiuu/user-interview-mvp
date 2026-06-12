import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Privacy Policy | User Interview',
  description: 'Privacy Policy for User Interview.',
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/" className={styles.topLink}>Back to User Interview</Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>User Interview</p>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.updated}>Last updated: June 12, 2026</p>
        </header>

        <p className={styles.intro}>
          This Privacy Policy explains how User Interview collects, uses, discloses, and protects information when you
          use our website, application, notetaker, and related services. By using User Interview, you agree to the
          practices described here.
        </p>

        <p className={styles.notice}>
          User Interview is an early access product for founder research, outreach, call preparation, transcripts, and
          interview insights. Do not submit highly sensitive information unless you have confirmed that the service,
          your plan, and any written agreement with us meet your requirements.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Information We Collect</h2>
          <ul className={styles.list}>
            <li>
              <strong>Account information:</strong> name, email address, profile image, authentication identifiers, and
              related account settings.
            </li>
            <li>
              <strong>Project and workspace content:</strong> startup descriptions, target customer notes, people lists,
              outreach projects, research notes, call prep, transcripts, uploaded or pasted text, AI prompts, AI
              outputs, and other content you provide.
            </li>
            <li>
              <strong>Interview and notetaker data:</strong> meeting metadata, transcript text, speaker labels, user
              notes, checklist events, session status, and technical information needed to operate the desktop or live
              notetaker experience.
            </li>
            <li>
              <strong>Usage and device information:</strong> pages visited, actions taken, timestamps, browser and
              device details, IP address, logs, error reports, and approximate location derived from network data.
            </li>
            <li>
              <strong>Communications:</strong> messages you send to us, feedback, support requests, and related contact
              information.
            </li>
            <li>
              <strong>Third-party information:</strong> information we receive from authentication providers, AI
              providers, transcription or meeting services, and other integrations you choose to use.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. How We Use Information</h2>
          <ul className={styles.list}>
            <li>Provide, maintain, secure, and improve User Interview.</li>
            <li>Create and manage accounts, projects, outreach workflows, call prep, transcripts, and insights.</li>
            <li>Generate AI-assisted analysis, summaries, recommendations, outreach drafts, and interview coaching.</li>
            <li>Authenticate users, prevent abuse, troubleshoot bugs, monitor performance, and protect the service.</li>
            <li>Respond to support requests, feedback, and administrative messages.</li>
            <li>Analyze product usage and develop new features.</li>
            <li>Comply with legal obligations and enforce our Terms.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. AI Processing</h2>
          <p className={styles.body}>
            User Interview uses third-party AI providers to generate parts of the product experience. We may send your
            project content, pasted research, transcripts, notes, and related context to those providers solely to
            provide the requested functionality, improve reliability, and operate the service.
          </p>
          <p className={styles.body}>
            AI outputs can be inaccurate, incomplete, or based on the context you provide. You are responsible for
            reviewing outputs before relying on them or sending them to others.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Cookies and Similar Technologies</h2>
          <p className={styles.body}>
            We and our service providers may use cookies, local storage, and similar technologies for authentication,
            security, remembering preferences, analytics, and product functionality. You can control cookies through your
            browser settings, but disabling them may prevent parts of the service from working.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. How We Share Information</h2>
          <p className={styles.body}>We may share information in the following circumstances:</p>
          <ul className={styles.list}>
            <li>
              <strong>Service providers:</strong> vendors that help us host, secure, analyze, transcribe, authenticate,
              support, and operate the service.
            </li>
            <li>
              <strong>AI and infrastructure providers:</strong> providers that process content to deliver AI-generated
              outputs, search, transcription, storage, and related features.
            </li>
            <li>
              <strong>Integrations you choose:</strong> third-party services you connect or direct us to use.
            </li>
            <li>
              <strong>Legal and safety reasons:</strong> when we believe disclosure is required by law, protects rights
              or safety, prevents fraud or abuse, or enforces our Terms.
            </li>
            <li>
              <strong>Business transfers:</strong> in connection with a merger, acquisition, financing, reorganization,
              or sale of assets.
            </li>
          </ul>
          <p className={styles.body}>
            We do not sell your personal information for money. We also do not knowingly share personal information for
            cross-context behavioral advertising.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Data Retention</h2>
          <p className={styles.body}>
            We retain information for as long as needed to provide the service, maintain business records, comply with
            legal obligations, resolve disputes, improve security, and enforce agreements. You may request deletion of
            your account or certain content by contacting us. Some information may remain in backups, logs, or records
            where retention is legally required or technically necessary.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Security</h2>
          <p className={styles.body}>
            We use reasonable administrative, technical, and organizational safeguards designed to protect information.
            No online service can guarantee perfect security. You are responsible for maintaining the confidentiality of
            your account credentials and for using the service in a way that is appropriate for the sensitivity of your
            data.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Your Choices and Rights</h2>
          <p className={styles.body}>
            Depending on where you live, you may have rights to access, correct, delete, export, or restrict certain
            personal information, and to object to certain processing. You may also have the right to appeal our response
            to a privacy request.
          </p>
          <p className={styles.body}>
            To make a request, email <a href="mailto:feedback@userinterview.app" className={styles.contact}>feedback@userinterview.app</a>.
            We may need to verify your identity before responding. We will not discriminate against you for exercising
            privacy rights required by applicable law.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. International Processing</h2>
          <p className={styles.body}>
            User Interview is operated from the United States. If you use the service from outside the United States,
            your information may be processed and stored in the United States and other countries where our providers
            operate.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Children</h2>
          <p className={styles.body}>
            User Interview is not directed to children under 13, and we do not knowingly collect personal information
            from children under 13. If you believe a child has provided us personal information, contact us so we can
            take appropriate action.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Changes to This Policy</h2>
          <p className={styles.body}>
            We may update this Privacy Policy from time to time. When we make material changes, we will update the date
            above and may provide additional notice through the service or by email.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Contact</h2>
          <p className={styles.body}>
            Questions or requests can be sent to <a href="mailto:feedback@userinterview.app" className={styles.contact}>feedback@userinterview.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
