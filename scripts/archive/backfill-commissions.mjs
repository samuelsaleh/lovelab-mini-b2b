#!/usr/bin/env node
/**
 * Backfill missing agent_commissions rows from existing order documents.
 *
 * For every document with document_type='order' and total_amount > 0:
 *   1. Look up the creator's profile to find their commission_rate
 *   2. Resolve the "current" agent ID via email (handles re-invited agents)
 *   3. If no agent_commissions row exists for (agent_id, document_id), insert one
 *
 * Usage: node scripts/backfill-commissions.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hnmydfafjghtrsrzpbtm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env or environment.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function main() {
  console.log(`Backfill commissions${dryRun ? ' (DRY RUN)' : ''}\n`);

  // 1. Fetch all agent profiles
  const { data: agents, error: agentsErr } = await supabase
    .from('profiles')
    .select('id, email, commission_rate, is_agent')
    .eq('is_agent', true);

  if (agentsErr) { console.error('Failed to fetch agents:', agentsErr.message); process.exit(1); }
  console.log(`Found ${agents.length} agent profiles`);

  // Build email -> current agent ID map (prefer active agents)
  const agentByEmail = new Map();
  for (const a of agents) {
    const email = normalizeEmail(a.email);
    if (email) agentByEmail.set(email, a);
  }

  // 2. Fetch all profiles (for resolving document creators)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, email, commission_rate');
  const profileById = new Map((allProfiles || []).map(p => [p.id, p]));

  // 3. Fetch all order documents
  const { data: docs, error: docsErr } = await supabase
    .from('documents')
    .select('id, created_by, total_amount, document_type, deleted_at, created_at')
    .eq('document_type', 'order')
    .is('deleted_at', null)
    .gt('total_amount', 0);

  if (docsErr) { console.error('Failed to fetch documents:', docsErr.message); process.exit(1); }
  console.log(`Found ${docs.length} active order documents with total_amount > 0`);

  // 4. Fetch existing commission rows
  const { data: existing } = await supabase
    .from('agent_commissions')
    .select('agent_id, document_id');

  const existingSet = new Set(
    (existing || []).map(c => `${c.agent_id}:${c.document_id}`)
  );
  console.log(`Found ${existing?.length || 0} existing commission rows\n`);

  // 5. Process each document
  let created = 0;
  let skipped = 0;
  let noAgent = 0;

  for (const doc of docs) {
    const creatorProfile = profileById.get(doc.created_by);
    if (!creatorProfile) { noAgent++; continue; }

    const creatorEmail = normalizeEmail(creatorProfile.email);
    const agentProfile = creatorEmail ? agentByEmail.get(creatorEmail) : null;

    if (!agentProfile) { noAgent++; continue; }

    const agentId = agentProfile.id;
    const key = `${agentId}:${doc.id}`;

    if (existingSet.has(key)) { skipped++; continue; }

    // Also check if any of the email-linked IDs already have a commission for this doc
    const allEmailIds = (allProfiles || [])
      .filter(p => normalizeEmail(p.email) === creatorEmail)
      .map(p => p.id);
    const anyExisting = allEmailIds.some(id => existingSet.has(`${id}:${doc.id}`));
    if (anyExisting) { skipped++; continue; }

    const rate = Number(agentProfile.commission_rate) || 0;
    const orderTotal = Number(doc.total_amount) || 0;
    const commissionAmount = Math.round((orderTotal * rate / 100) * 100) / 100;

    if (dryRun) {
      console.log(`[DRY] Would create: agent=${agentId}, doc=${doc.id}, total=${orderTotal}, rate=${rate}%, commission=${commissionAmount}`);
      created++;
      continue;
    }

    const { error: insertErr } = await supabase
      .from('agent_commissions')
      .insert({
        agent_id: agentId,
        document_id: doc.id,
        type: 'order',
        order_total: orderTotal,
        commission_rate: rate,
        commission_amount: commissionAmount,
        status: 'pending',
        notes: 'Backfilled from existing order document',
      });

    if (insertErr) {
      if (insertErr.message?.includes('duplicate') || insertErr.code === '23505') {
        skipped++;
      } else {
        console.error(`Failed to insert commission for doc ${doc.id}:`, insertErr.message);
      }
    } else {
      created++;
      existingSet.add(key);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  No agent found: ${noAgent}`);
}

main().catch(err => { console.error(err); process.exit(1); });
