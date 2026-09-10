// One-shot: give somebody at IGI Antwerp a login to their portal, and nothing else.
//
//   1. Creates a Supabase auth account with a temp password (or reuses an
//      existing one for that email).
//   2. Upserts their profile with is_igi = true and role = 'member'.
//
// Deliberately NOT added to allowed_emails: that list is LoveLab's own team.
// The IGI mark is what lets them in (lib/auth/isUserAllowed.js) and what keeps
// them inside /igi (lib/supabase/middleware.js).
//
// Usage:
//   node --env-file=.env.local scripts/add-igi-user.mjs <email> "<Full Name>" [password]
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env file.
//
// ALSO add the email to IGI_EMAILS in Vercel (comma-separated) so the mark is
// re-applied on every login, and so the account can sign in even if its
// profile row is ever recreated.

import { createClient } from '@supabase/supabase-js';
import { generateTempPassword } from '../lib/auth/generateTempPassword.js';

const [, , emailArg, nameArg, passwordArg] = process.argv;

if (!emailArg) {
  console.error('Usage: node --env-file=.env.local scripts/add-igi-user.mjs <email> "<Full Name>" [password]');
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

// Refuse to turn a LoveLab person into IGI by accident.
{
  const { data: internal } = await admin.from('allowed_emails').select('email').eq('email', email).maybeSingle();
  if (internal) {
    console.error(`${email} is on allowed_emails (LoveLab's own team). Remove it there first if this really is an IGI account.`);
    process.exit(1);
  }
}

// Auth account — reuse if one exists, else create with a temp password.
const password = passwordArg || generateTempPassword(fullName);
let authUser = null;
{
  const { data: existing } = await admin.auth.admin.listUsers({ filter: `email.eq.${email}`, perPage: 1 });
  const match = (existing?.users || []).find((u) => u.email?.toLowerCase() === email);
  if (match) {
    authUser = match;
    const { error } = await admin.auth.admin.updateUserById(match.id, { password });
    if (error) { console.error('Failed to set password on existing auth user:', error.message); process.exit(1); }
    console.log(`✓ auth user existed — password reset (id ${match.id})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (error || !data?.user) { console.error('Failed to create auth user:', error?.message); process.exit(1); }
    authUser = data.user;
    console.log(`✓ auth user created (id ${authUser.id})`);
  }
}

// Profile — IGI, member, choose their own password on first login.
{
  const { error } = await admin
    .from('profiles')
    .upsert({ id: authUser.id, email, full_name: fullName, role: 'member', is_igi: true, has_password_set: false }, { onConflict: 'id' });
  if (error) { console.error('Failed to upsert IGI profile:', error.message); process.exit(1); }
  console.log('✓ profile is_igi = true, role = member');
}

console.log('\n--- DONE ---');
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(`  Name:     ${fullName || '(none)'}`);
console.log('\nSend these privately. They sign in at /login with email + password and land on /igi.');
console.log('They cannot reach any other page of the app.');
console.log('\nALSO add this email to IGI_EMAILS in Vercel, then redeploy.');
