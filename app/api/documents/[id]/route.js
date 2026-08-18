import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, isUserOwnerOrSameEmail, requireEventPermission, resolveAgentFolderEventId } from '@/app/api/_lib/access';
import { syncConsignmentToLovelab } from '@/lib/lovelab-sync';
import { getSenderFrom, getOrderNotificationRecipients } from '@/lib/email';
import { orderNotificationEmail } from '@/lib/email-templates';
import { recordHealthEvent } from '@/lib/healthEvent';
import { resolveCommissionAgent, upsertCommissionForDocument } from '@/lib/commissionAttribution';
import { documentsHaveAgentIdColumn, normalizeAgentId } from '@/lib/agentIdColumn';
import { maybeCreateBonusForOrder } from '@/lib/newClientBonus';

// UUID format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET - Fetch a single document by ID
export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'docs-get' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    const { data: doc, error } = await adminSupabase
      .from('documents')
      .select('*, events(name, organization_id), creator:profiles!created_by(full_name, email), consignment_agent:profiles!consignment_agent_id(full_name, email)')
      .eq('id', id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Access check: admin can see everything; others can only see their own or event-shared docs
    const isOwner = doc.created_by === user.id;
    const eventAccess = doc.event_id
      ? await requireEventPermission(adminSupabase, doc.event_id, user.id, 'read', isAdmin).catch(() => ({ allowed: false }))
      : { allowed: false };
    if (!isAdmin && !isOwner && !eventAccess.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error('[Documents GET/:id] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update a document (replace when re-editing)
export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'docs-update' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    const body = await request.json();

    // First, get the old document to delete old file
    const { data: oldDoc, error: fetchError } = await adminSupabase
      .from('documents')
      .select('file_path, created_by, event_id, status, order_channel')
      .eq('id', id)
      .single();

    if (fetchError || !oldDoc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const isOwner = await isUserOwnerOrSameEmail(adminSupabase, oldDoc.created_by, user);
    const eventAccess = oldDoc.event_id
      ? await requireEventPermission(adminSupabase, oldDoc.event_id, user.id, 'edit', isAdmin)
      : { allowed: false };
    const canEdit = isAdmin || isOwner || eventAccess.allowed;
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete old file from storage if we have a new one
    if (oldDoc.file_path && body.file_path && oldDoc.file_path !== body.file_path) {
      await adminSupabase.storage.from('documents').remove([oldDoc.file_path]);
      // Also try owner-scoped path
      const filename = oldDoc.file_path.split('/').pop();
      const ownerScopedPath = `${oldDoc.created_by}/${filename}`;
      if (ownerScopedPath !== oldDoc.file_path) {
        await adminSupabase.storage.from('documents').remove([ownerScopedPath]);
      }
    }

    // Resolve draft/sent status. body.status wins when valid, otherwise keep
    // whatever the row already had. A draft→sent change is a "promotion": the
    // commission/bonus block below runs for any non-draft order, and the
    // internal notification email fires once on the transition (mirroring POST).
    const newStatus = (body.status === 'draft' || body.status === 'sent') ? body.status : oldDoc.status;
    const promotedToSent = oldDoc.status === 'draft' && newStatus === 'sent';

    // Folder resolution on update. The save modal re-fetches its folder list
    // on every open and can send event_id null when that fetch is slow/failed —
    // for non-admins this must NEVER strip an existing folder or leave a sent
    // b2b/b2c order unfiled (mandatory agent filing, Sam July 2026). Admins
    // keep full control (an explicit "No event" choice is respected).
    let effectiveEventId = body.event_id || null;
    if (!isAdmin && !effectiveEventId) {
      effectiveEventId = oldDoc.event_id || null;
      const channel = ['b2b', 'b2c', 'internal', 'consignment'].includes(body.order_channel)
        ? body.order_channel
        : oldDoc.order_channel;
      if (!effectiveEventId && newStatus !== 'draft' && ['b2b', 'b2c'].includes(channel)) {
        try {
          effectiveEventId = await resolveAgentFolderEventId(adminSupabase, oldDoc.created_by || user.id);
        } catch (autoFileErr) {
          console.error('[Documents PUT] agent auto-file failed (non-blocking):', autoFileErr?.message);
        }
      }
    }

    // Update the document record
    const updatePayload = {
      event_id: effectiveEventId,
      client_name: body.client_name,
      client_company: body.client_company,
      document_type: body.document_type,
      file_path: body.file_path,
      file_name: body.file_name,
      file_size: body.file_size,
      total_amount: body.total_amount,
      metadata: body.metadata,
    };
    if (['b2b', 'b2c', 'internal', 'consignment'].includes(body.order_channel)) {
      updatePayload.order_channel = body.order_channel;
    }
    if (newStatus) {
      updatePayload.status = newStatus;
    }
    // Offre bucket. Untouched unless the caller explicitly sends the key, so a
    // promotion to 'sent' (which omits it) keeps the row's provenance and any
    // other update path cannot silently move a document between folders.
    // Only admins may move a document into the Offre folder.
    if (isAdmin && Object.prototype.hasOwnProperty.call(body, 'draft_kind')) {
      updatePayload.draft_kind = body.draft_kind === 'offre' && newStatus === 'draft' ? 'offre' : null;
    }
    if (body.order_channel === 'consignment') {
      updatePayload.consignment_agent_id = body.consignment_agent_id || null;
    }
    // Selling agent. Only touched when the caller explicitly sends the key
    // (so older clients that never send agent_id can't wipe it) and only when
    // the column exists. Normalized against oldDoc.created_by so an agent's
    // own order keeps its agent when the field is left blank.
    const putAgentColumn = await documentsHaveAgentIdColumn(adminSupabase);
    if (putAgentColumn && Object.prototype.hasOwnProperty.call(body, 'agent_id')) {
      updatePayload.agent_id = await normalizeAgentId(adminSupabase, body.agent_id, {
        creatorId: oldDoc.created_by,
      });
    }
    const { data: doc, error: updateError } = await adminSupabase
      .from('documents')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Documents PUT] Error:', updateError.message, updateError.code, updateError.details);
      if (updateError.code === '42501' || updateError.message?.includes('policy')) {
        return NextResponse.json({ error: 'Permission denied - RLS policy blocks update. Run the SQL migration to fix.' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to update document: ' + updateError.message }, { status: 500 });
    }

    // Recalculate commission when total_amount changes (skip for internal and consignment orders)
    // Attribution logic shared with POST — see lib/commissionAttribution.js.
    try {
      if (doc?.total_amount > 0 && doc?.status !== 'draft' && doc?.order_channel !== 'internal' && doc?.order_channel !== 'consignment') {
        const attribution = await resolveCommissionAgent(adminSupabase, doc);
        if (attribution) {
          await upsertCommissionForDocument(adminSupabase, {
            document: doc,
            profile: attribution.profile,
            agentId: attribution.agentId,
          });
          // Phase 19 — new-client bonus. Same pattern as POST: isolated
          // try/catch so a bonus failure doesn't break the recalc above.
          try {
            await maybeCreateBonusForOrder(adminSupabase, {
              agentId: attribution.agentId,
              profile: attribution.profile,
              document: doc,
            });
          } catch (bonusErr) {
            await recordHealthEvent({
              source: 'documents_put_new_client_bonus_hook',
              severity: 'warn',
              message: bonusErr.message || 'New-client bonus hook failed',
              context: {
                documentId: doc?.id || null,
                agentId: attribution.agentId,
                code: bonusErr.code || null,
              },
            });
          }
        }
      }
    } catch (commErr) {
      // Tier A — never silent. See lib/healthEvent.js.
      await recordHealthEvent({
        source: 'documents_put_commission_recalc',
        severity: 'error',
        message: commErr.message || 'Commission recalculation failed',
        context: {
          documentId: doc?.id || null,
          createdBy: doc?.created_by || null,
          orderChannel: doc?.order_channel || null,
          totalAmount: doc?.total_amount ?? null,
          code: commErr.code || null,
          details: commErr.details || null,
        },
      });
    }

    // Internal notification on draft→sent promotion only.
    const shouldNotify = promotedToSent;
    if (shouldNotify) {
      try {
        const resendApiKey =
          doc?.order_channel === 'internal' || doc?.order_channel === 'consignment' || doc?.order_channel === 'delete_from_stock'
            ? null
            : process.env.RESEND_API_KEY;
        if (resendApiKey) {
          const eventName = doc.event_id
            ? (await adminSupabase.from('events').select('name').eq('id', doc.event_id).single())?.data?.name
            : null;
          const creatorName =
            (await adminSupabase.from('profiles').select('full_name').eq('id', doc.created_by).single())?.data?.full_name ||
            user.email;
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab-b2b.vercel.app';
          const { subject, html } = orderNotificationEmail({
            documentType: doc.document_type,
            clientCompany: doc.client_company,
            clientName: doc.client_name,
            totalAmount: doc.total_amount,
            eventName,
            creatorName,
          }, siteUrl);
          const { Resend } = await import('resend');
          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: getSenderFrom(),
            to: getOrderNotificationRecipients(),
            subject,
            html,
          });
        }
      } catch (emailErr) {
        console.error('[Documents PUT] Promotion notification email error (non-blocking):', emailErr.message);
      }
    }

    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error('[Documents PUT] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Soft-delete a document (moves to trash, recoverable for 7 days)
export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'docs-delete' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    // Verify document exists and belongs to user
    const { data: doc, error: fetchError } = await adminSupabase
      .from('documents')
      .select('id, created_by, event_id')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const isOwner = await isUserOwnerOrSameEmail(adminSupabase, doc.created_by, user);
    const eventAccess = doc.event_id
      ? await requireEventPermission(adminSupabase, doc.event_id, user.id, 'edit', isAdmin)
      : { allowed: false };
    const canDelete = isAdmin || isOwner || eventAccess.allowed;
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft-delete: set deleted_at timestamp, keep file in storage
    const { error: updateError } = await adminSupabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      console.error('[Documents DELETE] Error:', updateError.message);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    // Cascade: cancel linked commissions so they stop showing up in agent
    // pending totals. Never touch a 'paid' row — that's an admin/refund flow.
    // Soft-delete on documents does NOT trigger the FK ON DELETE CASCADE, so
    // we must do this explicitly. See docs/cascade-delete-audit.md gap 1.
    try {
      const { error: cascadeErr } = await adminSupabase
        .from('agent_commissions')
        .update({
          status: 'cancelled',
          notes: 'Auto-cancelled because the linked document was soft-deleted.',
        })
        .eq('document_id', id)
        .neq('status', 'paid');

      if (cascadeErr) {
        await recordHealthEvent({
          source: 'documents_delete_commission_cascade',
          severity: 'error',
          message: cascadeErr.message || 'Failed to cancel linked commissions',
          context: { documentId: id, code: cascadeErr.code || null },
        });
      }
    } catch (cascadeThrew) {
      await recordHealthEvent({
        source: 'documents_delete_commission_cascade',
        severity: 'error',
        message: cascadeThrew?.message || 'Cascade threw',
        context: { documentId: id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Rename a document (update file_name only)
export async function PATCH(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'docs-rename' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    const body = await request.json();
    const newName = body.file_name?.trim();
    const newChannel = body.order_channel;
    const newEventId = body.event_id;
    const newMetadata = body.metadata; // optional partial metadata merge
    const newConsignmentAgentId = body.consignment_agent_id; // optional
    const hasAgentId = Object.prototype.hasOwnProperty.call(body, 'agent_id'); // optional re-tag

    const { data: doc, error: fetchError } = await adminSupabase
      .from('documents')
      .select('id, created_by, event_id, metadata, order_channel, status, document_type, client_name, client_company, total_amount, file_name')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const isOwner = await isUserOwnerOrSameEmail(adminSupabase, doc.created_by, user);
    const eventAccess = doc.event_id
      ? await requireEventPermission(adminSupabase, doc.event_id, user.id, 'edit', isAdmin)
      : { allowed: false };

    // Must provide at least one updatable field
    const hasName = newName && newName.length <= 255;
    const hasChannel = ['b2b', 'b2c', 'internal', 'consignment'].includes(newChannel);
    // event_id may legitimately be set to null here (re-tagging an order back to
    // "no fair"), so treat the mere presence of the key as an update intent.
    const hasEventId = Object.prototype.hasOwnProperty.call(body, 'event_id');
    const hasMetadata = newMetadata !== undefined && newMetadata !== null;
    if (!hasName && !hasChannel && !hasMetadata && !hasEventId && !hasAgentId) {
      return NextResponse.json({ error: 'Provide file_name, order_channel, event_id, agent_id, or metadata' }, { status: 400 });
    }
    // Changing order_channel is admin-only
    if (hasChannel && !isAdmin) {
      return NextResponse.json({ error: 'Only admins can change order channel' }, { status: 403 });
    }
    if (!isAdmin && !isOwner && !eventAccess.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const patchPayload = {};
    if (hasName) patchPayload.file_name = newName;
    if (hasChannel) patchPayload.order_channel = newChannel;
    if (hasEventId) patchPayload.event_id = newEventId;
    if (hasMetadata) {
      const existing = doc.metadata || {};
      const merged = { ...existing, ...(newMetadata || {}) };
      // Deep-merge known nested objects so a partial patch doesn't clobber sibling keys
      for (const key of ['consignment', 'formState']) {
        if (existing[key] && newMetadata?.[key] && typeof existing[key] === 'object' && typeof newMetadata[key] === 'object') {
          merged[key] = { ...existing[key], ...newMetadata[key] };
        }
      }
      patchPayload.metadata = merged;
    }
    if (newConsignmentAgentId !== undefined) {
      patchPayload.consignment_agent_id = newConsignmentAgentId || null;
    }
    // Re-tag the selling agent (the "who brought it" control). Guarded by the
    // column probe so a migration-behind environment ignores it gracefully.
    const patchAgentColumn = await documentsHaveAgentIdColumn(adminSupabase);
    if (patchAgentColumn && hasAgentId) {
      patchPayload.agent_id = await normalizeAgentId(adminSupabase, body.agent_id, {
        creatorId: doc.created_by,
      });
    }

    const { data: updated, error: updateError } = await adminSupabase
      .from('documents')
      .update(patchPayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Documents PATCH] DB error:', updateError);
      return NextResponse.json({ error: 'Failed to update document', detail: updateError.message }, { status: 500 });
    }

    // Re-tagging the agent or the fair on a revenue order must refresh the
    // commission ledger so the agent's totals follow the new attribution.
    // Mirrors the PUT recalc; isolated so a recalc hiccup never fails the patch.
    if ((hasAgentId || hasEventId) &&
        updated?.total_amount > 0 && updated?.status !== 'draft' &&
        updated?.order_channel !== 'internal' && updated?.order_channel !== 'consignment') {
      try {
        const attribution = await resolveCommissionAgent(adminSupabase, updated);
        if (attribution) {
          await upsertCommissionForDocument(adminSupabase, {
            document: updated,
            profile: attribution.profile,
            agentId: attribution.agentId,
          });
        }
      } catch (recalcErr) {
        await recordHealthEvent({
          source: 'documents_patch_commission_recalc',
          severity: 'warn',
          message: recalcErr.message || 'Commission recalc on re-tag failed',
          context: { documentId: id },
        }).catch(() => {});
      }
    }

    // Lovelab Sync: Sync returned consignment orders
    if (updated.order_channel === 'consignment' && updated.metadata?.consignment?.returned_at) {
      // Non-blocking
      syncConsignmentToLovelab(updated, true).catch(err => console.error('[Lovelab Sync PATCH] error:', err));
    }

    return NextResponse.json({ document: updated });
  } catch (error) {
    console.error('[Documents PATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
