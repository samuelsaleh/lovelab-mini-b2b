'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { colors } from '@/lib/styles';
import PasswordSetForm from '@/app/components/PasswordSetForm';

/**
 * Reset Password — picks a new password against an existing recovery session.
 *
 * The recovery email's link routes through /auth/callback?type=recovery&next=/reset-password
 * first, so by the time we render here the user already has a valid Supabase
 * session. If they hit this page directly (or the recovery token expired
 * before the callback ran), we bounce them back to /forgot-password.
 *
 * After a successful password change we redirect to / (the app shell handles
 * routing them to /agent or /admin based on their role).
 */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.lovelabBg,
          }}
        >
          Loading...
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // No session means the recovery link wasn't valid (expired, already
        // used, or the user opened this URL directly without the callback).
        router.replace('/forgot-password?expired=1');
      } else {
        setAuthChecked(true);
      }
    });
  }, [router]);

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.lovelabBg,
        }}
      >
        Checking your reset link...
      </div>
    );
  }

  return (
    <PasswordSetForm
      headline="Choose a new password"
      subtext="Pick a new password for your LoveLab account. After saving you'll be signed in automatically."
      submitLabel="Save new password"
      markPasswordSet
      onSuccess={() => router.replace('/')}
    />
  );
}
