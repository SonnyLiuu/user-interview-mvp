import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Terms of Service | User Interview',
  description: 'Terms of Service for User Interview.',
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/" className={styles.topLink}>Back to User Interview</Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>User Interview</p>
          <h1 className={styles.title}>Terms of Service</h1>
          <p className={styles.updated}>Last updated: June 12, 2026</p>
        </header>

        <p className={styles.intro}>
          These Terms of Service govern your access to and use of User Interview, including our website, application,
          desktop notetaker, AI-assisted research tools, and related services. By using the service, you agree to these
          Terms.
        </p>

        <p className={styles.notice}>
          User Interview is currently an early access product. The service may change quickly, and some features may be
          experimental, incomplete, unavailable, or discontinued.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Eligibility and Accounts</h2>
          <p className={styles.body}>
            You must be at least 18 years old and able to form a binding contract to use User Interview. You are
            responsible for the accuracy of the information you provide, for keeping your account secure, and for all
            activity under your account.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. The Service</h2>
          <p className={styles.body}>
            User Interview helps founders organize startup context, identify people to talk to, prepare outreach and
            interviews, capture notes or transcripts, and synthesize insights. We may modify, suspend, or discontinue
            any part of the service at any time.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Your Content</h2>
          <p className={styles.body}>
            You retain ownership of content you submit to User Interview, including project descriptions, pasted text,
            people records, notes, transcripts, prompts, and other materials. You grant User Interview a worldwide,
            non-exclusive license to host, process, transmit, display, reproduce, and create derivative works from your
            content solely as needed to provide, secure, support, and improve the service.
          </p>
          <p className={styles.body}>
            You represent that you have the rights and permissions necessary to submit your content and to allow us to
            process it under these Terms and our Privacy Policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. AI Outputs</h2>
          <p className={styles.body}>
            User Interview uses AI systems to generate summaries, analysis, recommendations, interview coaching, and
            outreach drafts. AI outputs may be inaccurate, incomplete, outdated, or inappropriate for your situation.
            You are responsible for reviewing and validating outputs before relying on them or sharing them.
          </p>
          <p className={styles.body}>
            User Interview does not provide legal, financial, investment, medical, hiring, or professional advice. You
            should not treat AI outputs as a substitute for professional judgment.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Acceptable Use</h2>
          <p className={styles.body}>You agree not to:</p>
          <ul className={styles.list}>
            <li>Use the service in violation of law, privacy rights, intellectual property rights, or these Terms.</li>
            <li>Submit content you do not have the right to process, record, upload, or analyze.</li>
            <li>Record or transcribe conversations without required consent.</li>
            <li>Use the service to send spam, deceptive outreach, harassment, or unlawful communications.</li>
            <li>Attempt to reverse engineer, scrape, overload, disrupt, or bypass security controls.</li>
            <li>Upload malware or use the service to compromise another system.</li>
            <li>Use outputs to make high-stakes decisions without appropriate human review and legal compliance.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Third-Party Services</h2>
          <p className={styles.body}>
            The service may depend on third-party providers for authentication, hosting, AI processing, transcription,
            meeting capture, email, analytics, and other functionality. Your use of connected third-party services may
            be governed by their own terms and policies. We are not responsible for third-party services that we do not
            control.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Desktop Notetaker and Recordings</h2>
          <p className={styles.body}>
            If you use recording, transcription, or notetaker features, you are responsible for obtaining all legally
            required consents from meeting participants and for complying with applicable recording, wiretap,
            employment, confidentiality, and data protection laws. You should not use these features where recording or
            transcription is prohibited.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Fees</h2>
          <p className={styles.body}>
            Some parts of User Interview may be free during early access. We may introduce paid plans or usage limits in
            the future. If we do, we will provide applicable pricing and payment terms before charging you.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Our Intellectual Property</h2>
          <p className={styles.body}>
            User Interview and its software, design, trademarks, logos, workflows, and documentation are owned by us or
            our licensors. Except for the limited right to use the service under these Terms, we do not grant you any
            rights to our intellectual property.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Feedback</h2>
          <p className={styles.body}>
            If you send ideas, suggestions, bug reports, or other feedback, you grant us permission to use that feedback
            without restriction or compensation to you.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Suspension and Termination</h2>
          <p className={styles.body}>
            You may stop using the service at any time. We may suspend or terminate access if we believe you violated
            these Terms, created risk for the service or other users, or used the service unlawfully. After termination,
            certain provisions will continue to apply, including provisions about intellectual property, disclaimers,
            limitations of liability, indemnity, and dispute terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Disclaimers</h2>
          <p className={styles.body}>
            The service is provided "as is" and "as available." To the maximum extent permitted by law, we disclaim all
            warranties, express or implied, including warranties of merchantability, fitness for a particular purpose,
            title, non-infringement, availability, accuracy, and reliability.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>13. Limitation of Liability</h2>
          <p className={styles.body}>
            To the maximum extent permitted by law, User Interview will not be liable for indirect, incidental, special,
            consequential, exemplary, or punitive damages, or for lost profits, revenues, goodwill, data, or business
            opportunities. To the maximum extent permitted by law, our total liability for any claim relating to the
            service will not exceed the greater of the amount you paid us for the service in the 12 months before the
            claim or $100.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>14. Indemnity</h2>
          <p className={styles.body}>
            To the extent permitted by law, you agree to defend, indemnify, and hold harmless User Interview from claims,
            liabilities, damages, losses, and expenses arising from your content, your use of the service, your violation
            of these Terms, or your violation of law or third-party rights.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>15. Governing Law</h2>
          <p className={styles.body}>
            These Terms are governed by the laws of the State of California, without regard to conflict of law rules,
            except where applicable law requires otherwise.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>16. Changes to These Terms</h2>
          <p className={styles.body}>
            We may update these Terms from time to time. If we make material changes, we will update the date above and
            may provide additional notice through the service or by email. Continued use of the service after changes
            take effect means you accept the updated Terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>17. Contact</h2>
          <p className={styles.body}>
            Questions about these Terms can be sent to <a href="mailto:feedback@userinterview.app" className={styles.contact}>feedback@userinterview.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
