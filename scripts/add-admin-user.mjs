// One-shot: provision (or promote) an internal ADMIN user.
//
// Does everything needed for a non-agent admin to log in with a password:
//   1. Adds the email to allowed_emails (the login gate).
//   2. Creates a Supabase auth account with a temp password (or reuses an
//      existing auth user, e.g. if they once signed in with Google).
//   3. Upserts their profile with role = 'admin'.
//
// Yahoo/Outlook/etc. addresses can't use Google sign-in, so we use a password.
// The temp password never expires and works from any device.
//
// Usage:
//   node --env-file=.env scripts/add-admin-user.mjs <email> "<Full Name>" [password]
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
//
// NOTE: also add the email to the ADMIN_EMAILS env var in Vercel so the admin
// role is re-applied automatically on every future login (self-healing).

import { createClient } from '@supabase/supabase-js';
import { generateTempPassword } from '../lib/auth/generateTempPassword.js';

const [, , emailArg, nameArg, passwordArg] = process.argv;

if (!emailArg) {
  console.error('Usage: node --env-file=.env scripts/add-admin-user.mjs <email> "<Full Name>" [password]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const email = emailArg.toLowerCase().trim();
const fullName = (nameArg || '').trim();

// 1. Login gate — allowed_emails.
{
  const { error } = await admin
    .from('allowed_emails')
    .upsert({ email }, { onConflict: 'email' });
  if (error) {
    console.error('Failed to add to allowed_emails:', error.message);
    process.exit(1);
  }
  console.log(`✓ allowed_emails: ${email}`);
}

// 2. Auth account — reuse if one already exists, else create with a temp password.
const password = passwordArg || generateTempPassword(fullName);
let authUser = null;
{
  const { data: existing } = await admin.auth.admin.listUsers({
    filter: `email.eq.${email}`,
    perPage: 1,
  });
  const match = (existing?.users || []).find((u) => u.email?.toLowerCase() === email);

  if (match) {
    authUser = match;
    const { error } = await admin.auth.admin.updateUserById(match.id, { password });
    if (error) {
      console.error('Failed to set password on existing auth user:', error.message);
      process.exit(1);
    }
    console.log(`✓ auth user existed — password reset (id ${match.id})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data?.user) {
      console.error('Failed to create auth user:', error?.message);
      process.exit(1);
    }
    authUser = data.user;
    console.log(`✓ auth user created (id ${authUser.id})`);
  }
}

// 3. Profile — role = 'admin'. has_password_set:false forces them to choose
//    their own password on first login.
{
  const { error } = await admin
    .from('profiles')
    .upsert(
      {
        id: authUser.id,
        email,
        full_name: fullName,
        role: 'admin',
        has_password_set: false,
      },
      { onConflict: 'id' },
    );
  if (error) {
    console.error('Failed to upsert admin profile:', error.message);
    process.exit(1);
  }
  console.log(`✓ profile role = admin`);
}

console.log('\n--- DONE ---');
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(`  Name:     ${fullName || '(none)'}`);
console.log('\nSend these credentials privately. They sign in at /login with email + password,');
console.log('then choose their own password on first login.');
console.log('\nIMPORTANT: also add this email to ADMIN_EMAILS in Vercel so the admin role is');
console.log('re-applied automatically on every future login.');
