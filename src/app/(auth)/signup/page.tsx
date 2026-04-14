import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
      <SignUp routing="hash" afterSignUpUrl="/onboarding" signInUrl="/login" />
    </div>
  );
}
