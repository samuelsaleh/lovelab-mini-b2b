// One-shot rescue script for agents whose magic-link onboarding broke.
//
// Usage:
//   node --env-file=.env scripts/reset-agent-password.js <email> [password]
//
// If [password] is omitted, a fresh temp password is generated.
// Prints the credentials so you can pass them to the agent over WhatsApp / phone.
//
// Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env
// (the project's existing .env — same file npm run dev reads).

import { createClient } from '@supabase/supabase-js';
import { generateTempPassword } from '../lib/auth/generateTempPassword.js';

const [, , emailArg, passwordArg] = process.argv;

if (!emailArg) {
  console.error('Usage: node scripts/reset-agent-password.js <email> [password]');
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

const { data: profile, error: profileErr } = await admin
  .from('profiles')
  .select('id, email, full_name, is_agent, agent_status')
  .eq('email', email)
  .maybeSingle();

if (profileErr || !profile) {
  console.error(`No profile found for ${email}.`, profileErr?.message || '');
  process.exit(1);
}

const password = passwordArg || generateTempPassword(profile.full_name);

const { error: pwErr } = await admin.auth.admin.updateUserById(profile.id, { password });
if (pwErr) {
  console.error('Failed to set password:', pwErr.message);
  process.exit(1);
}

const { error: flagErr } = await admin
  .from('profiles')
  .update({ has_password_set: false, agent_status: 'active' })
  .eq('id', profile.id);
if (flagErr) {
  console.error('Failed to update profile flags:', flagErr.message);
  process.exit(1);
}

console.log('---');
console.log('Password reset complete.');
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(`  Name:     ${profile.full_name || '(none)'}`);
console.log('---');
console.log('Tell the agent to sign in with these credentials.');
console.log('They will be forced to pick their own password on first login.');
