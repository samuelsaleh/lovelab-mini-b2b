'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { colors } from '@/lib/styles';
import PasswordSetForm from '@/app/components/PasswordSetForm';
import { useAuth } from '@/app/components/AuthProvider';

export default function SetPasswordPage() {
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
      <SetPasswordContent />
    </Suspense>
  );
}

// Reject anything that isn't a same-origin app path. Mirrors the validator
// in /auth/callback so we can't be tricked into bouncing the user off-site.
function getSafeNext(raw) {
  if (!raw) return '/';
  if (!/^\/[^/]/.test(raw) && raw !== '/') return '/';
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return '/';
  if (/[\\@]/.test(raw)) return '/';
  if (/%2f/i.test(raw)) return '/';
  return raw;
}

function SetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeNext(searchParams.get('next'));
  const [authChecked, setAuthChecked] = useState(false);
  const { refreshProfile } = useAuth();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
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
        Loading...
      </div>
    );
  }

  return (
    <PasswordSetForm
      headline="Choose your password to finish setup"
      subtext="Welcome to LoveLab! To keep your account secure, please replace the temporary password from the invite email with one only you know. You'll use it every time you sign in."
      submitLabel="Save password & enter LoveLab"
      markPasswordSet
      onSuccess={async () => {
        // Refresh the auth cache BEFORE navigating away so the
        // AuthProvider's force-set-password gate sees has_password_set:true
        // when the next page mounts. Without this, the gate would
        // immediately redirect back to /set-password (loop).
        await refreshProfile();
        router.replace(next);
      }}
    />
  );
}
