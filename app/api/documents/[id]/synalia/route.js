/**
 * PATCH /api/documents/[id]/synalia
 * Body: { jewelerGroup: string } or legacy { synalia: boolean }
 * Admin-only — sets the client's jeweler group for reporting.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import {
  JEWELER_GROUP,
  isSynaliaJewelerGroup,
  isValidJewelerGroup,
  normalizeJewelerGroup,
} from '@/lib/jewelerGroup';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'doc-synalia' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    let jewelerGroup;
    if (body.jewelerGroup != null) {
      if (!isValidJewelerGroup(body.jewelerGroup)) {
        return NextResponse.json({ error: 'Invalid jewelerGroup' }, { status: 400 });
      }
      jewelerGroup = normalizeJewelerGroup(body.jewelerGroup);
    } else if (typeof body.synalia === 'boolean') {
      jewelerGroup = body.synalia ? JEWELER_GROUP.SYNALIA : JEWELER_GROUP.AUCUN;
    } else {
      return NextResponse.json({ error: 'jewelerGroup must be valid or synalia must be a boolean' }, { status: 400 });
    }

    const { data: doc, error: fetchErr } = await adminSupabase
      .from('documents')
      .select('id, metadata')
      .eq('id', id)
      .single();

    if (fetchErr || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const existing = doc.metadata || {};
    const synalia = isSynaliaJewelerGroup(jewelerGroup);
    const merged = {
      ...existing,
      jewelerGroup,
      synalia,
      formState: {
        ...(existing.formState || {}),
        jewelerGroup,
        synalia,
      },
    };

    const { data: updated, error: updateErr } = await adminSupabase
      .from('documents')
      .update({ metadata: merged })
      .eq('id', id)
      .select('id, metadata')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
    }

    return NextResponse.json({ document: updated });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
