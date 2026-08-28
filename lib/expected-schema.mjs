/**
 * EXPECTED DATABASE SCHEMA — single source of truth.
 *
 * Lists every table, column, index, constraint and function the application
 * code depends on. Compared against the live Supabase database by
 * `scripts/check-schema-drift.mjs`.
 *
 * If the drift script reports something missing here, the production DB is
 * out of sync with the codebase — find or write the migration that adds it
 * and apply it before merging more changes.
 *
 * Layout:
 *   tables[].columns[]      — column name + a substring matcher for data_type
 *   tables[].uniqueIndexes  — partial / non-partial unique indexes that the
 *                             code does ON CONFLICT against (or counts on)
 *   tables[].checks         — CHECK constraint names we expect to exist
 *   functions[]             — SECURITY DEFINER helpers used by RLS policies
 *
 * Migrations that should produce each item are listed in `source` so we can
 * trace drift back to the missing migration file.
 */

export const expectedSchema = {
  tables: [
    {
      name: 'profiles',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-setup.sql' },
        { name: 'email', type: 'text', source: 'supabase-setup.sql' },
        { name: 'full_name', type: 'text', source: 'supabase-setup.sql' },
        { name: 'role', type: 'text', source: 'supabase-setup.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase-phase4-fixes.sql' },
        { name: 'is_agent', type: 'boolean', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_status', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'commission_rate', type: 'numeric', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_since', type: 'timestamp', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_conditions', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_phone', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_company', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_country', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_city', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_region', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_territory', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_specialty', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_notes', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'has_password_set', type: 'boolean', source: 'supabase-phase10-agent-password.sql' },
        { name: 'agent_commission_config', type: 'jsonb', source: 'supabase-phase11-commission-config.sql' },
        { name: 'organization_id', type: 'uuid', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'agent_deleted_at', type: 'timestamp', source: 'supabase-codify-existing-schema.sql' },
        { name: 'agent_contract_url', type: 'text', source: 'supabase-codify-existing-schema.sql' },
        { name: 'is_igi', type: 'boolean', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'new_client_bonus_enabled', type: 'boolean', source: 'supabase-phase19-new-client-bonus.sql' },
        { name: 'new_client_bonus_amount', type: 'numeric', source: 'supabase-phase19-new-client-bonus.sql' },
        { name: 'new_client_bonus_mode', type: 'text', source: 'supabase/migrations/20260812120000_new_client_bonus_mode.sql' },
        { name: 'is_assistant', type: 'boolean', source: 'supabase/migrations/20260818090000_commercial_assistants.sql' },
      ],
      checks: [
        'profiles_agent_status_check',
        'profiles_commission_rate_check',
        'profiles_new_client_bonus_amount_check',
        'profiles_new_client_bonus_mode_check',
      ],
    },

    {
      name: 'allowed_emails',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-setup.sql' },
        { name: 'email', type: 'text', source: 'supabase-setup.sql' },
        { name: 'added_by', type: 'uuid', source: 'supabase-setup.sql' },
      ],
    },

    {
      name: 'events',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-setup.sql' },
        { name: 'name', type: 'text', source: 'supabase-setup.sql' },
        { name: 'location', type: 'text', source: 'supabase-setup.sql' },
        { name: 'start_date', type: 'date', source: 'supabase-setup.sql' },
        { name: 'end_date', type: 'date', source: 'supabase-setup.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase-setup.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase-phase4-fixes.sql' },
        { name: 'organization_id', type: 'uuid', source: 'supabase/migrations/20260311100000_events_organization_link.sql' },
        { name: 'type', type: 'text', source: 'supabase-codify-existing-schema.sql' },
      ],
      checks: ['events_type_check'],
      uniqueIndexes: [
        {
          name: 'events_agent_name_org_unique',
          source: 'supabase-phase17-event-dedup.sql',
        },
      ],
    },

    {
      name: 'documents',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase3.sql' },
        { name: 'event_id', type: 'uuid', source: 'supabase-phase3.sql' },
        { name: 'client_name', type: 'text', source: 'supabase-phase3.sql' },
        { name: 'client_company', type: 'text', source: 'supabase-phase3.sql' },
        { name: 'document_type', type: 'text', source: 'supabase-phase3.sql' },
        { name: 'file_path', type: 'text', source: 'supabase-phase3.sql' },
        { name: 'file_name', type: 'text', source: 'supabase-phase3.sql' },
        { name: 'file_size', type: 'integer', source: 'supabase-phase3.sql' },
        { name: 'total_amount', type: 'numeric', source: 'supabase-phase3.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase-phase3.sql' },
        { name: 'metadata', type: 'jsonb', source: 'supabase-phase3.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase-phase4-fixes.sql' },
        { name: 'deleted_at', type: 'timestamp', source: 'supabase-phase4-fixes.sql' },
        { name: 'order_channel', type: 'text', source: 'supabase-b2b-b2c-orders.sql (root) + extended in supabase/migrations/' },
        { name: 'consignment_agent_id', type: 'uuid', source: 'supabase/migrations/20260330000000_consignment.sql' },
        { name: 'status', type: 'text', source: 'supabase-phase24-draft-orders.sql' },
        { name: 'draft_kind', type: 'text', source: 'supabase-phase25-offre-orders.sql' },
        { name: 'agent_id', type: 'uuid', source: 'supabase/migrations/20260818130000_documents_agent_id.sql' },
      ],
      checks: ['documents_order_channel_check', 'documents_status_check', 'documents_draft_kind_check'],
      orderChannelValues: ['b2b', 'b2c', 'internal', 'consignment', 'delete_from_stock'],
    },

    {
      name: 'clients',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase4-fixes.sql' },
        { name: 'name', type: 'text', source: 'supabase-phase4-fixes.sql' },
        { name: 'company', type: 'text', source: 'supabase-phase4-fixes.sql' },
        { name: 'country', type: 'text', source: 'supabase-phase4-fixes.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase-phase4-fixes.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase-phase4-fixes.sql' },
        { name: 'source', type: 'text', source: 'supabase-phase15-salesforce-clients.sql' },
        { name: 'source_comment', type: 'text', source: 'supabase-phase15-salesforce-clients.sql' },
        { name: 'source_imported_at', type: 'timestamp', source: 'supabase-phase15-salesforce-clients.sql' },
        { name: 'dzb_client_number', type: 'text', source: 'supabase-phase31-client-dzb-group.sql' },
        { name: 'jeweler_group', type: 'text', source: 'supabase-phase31-client-dzb-group.sql' },
        { name: 'shipping_same_as_billing', type: 'boolean', source: 'supabase-phase32-client-shipping.sql' },
        { name: 'shipping_address', type: 'text', source: 'supabase-phase32-client-shipping.sql' },
        { name: 'shipping_address_line2', type: 'text', source: 'supabase-phase32-client-shipping.sql' },
        { name: 'shipping_country', type: 'text', source: 'supabase-phase32-client-shipping.sql' },
      ],
      checks: ['clients_source_check'],
    },

    {
      name: 'pending_signups',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase7-signup-requests.sql' },
        { name: 'email', type: 'text', source: 'supabase-phase7-signup-requests.sql' },
        { name: 'full_name', type: 'text', source: 'supabase-phase7-signup-requests.sql' },
        { name: 'token', type: 'uuid', source: 'supabase-phase7-signup-requests.sql' },
        { name: 'status', type: 'text', source: 'supabase-phase7-signup-requests.sql' },
      ],
    },

    {
      name: 'agent_commissions',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase8-agents.sql' },
        { name: 'agent_id', type: 'uuid', source: 'supabase-phase8-agents.sql' },
        { name: 'document_id', type: 'uuid', source: 'supabase-phase8-agents.sql' },
        { name: 'type', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'order_total', type: 'numeric', source: 'supabase-phase8-agents.sql' },
        { name: 'commission_rate', type: 'numeric', source: 'supabase-phase8-agents.sql' },
        { name: 'commission_amount', type: 'numeric', source: 'supabase-phase8-agents.sql' },
        { name: 'status', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'paid_at', type: 'timestamp', source: 'supabase-phase8-agents.sql' },
        { name: 'notes', type: 'text', source: 'supabase-phase8-agents.sql' },
        { name: 'customer_paid_at', type: 'timestamp', source: 'supabase-phase19b-customer-paid.sql' },
        { name: 'client_label', type: 'text', source: 'supabase-phase27-quick-orders.sql' },
        { name: 'invoice_number', type: 'text', source: 'supabase-phase28-commission-invoice-number.sql' },
        { name: 'report_id', type: 'uuid', source: 'supabase-phase29-payment-driven-settlement.sql' },
      ],
      checks: [
        // Widened in supabase-phase19-new-client-bonus-fix.sql to add 'new_client_bonus'.
        'agent_commissions_type_check',
      ],
      // Partial unique index — the ON CONFLICT in code MUST match this WHERE clause.
      // Renamed in supabase-phase19d-bonus-unique-fix.sql to add 'type' so that
      // a type='order' and a type='new_client_bonus' can share the same document.
      uniqueIndexes: [
        {
          name: 'agent_commissions_agent_document_type_unique',
          columns: ['agent_id', 'document_id', 'type'],
          predicate: 'document_id IS NOT NULL',
        },
      ],
    },

    {
      name: 'agent_payments',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase9-reports.sql' },
        { name: 'agent_id', type: 'uuid', source: 'supabase-phase9-reports.sql' },
        { name: 'amount', type: 'numeric', source: 'supabase-phase9-reports.sql' },
        { name: 'payment_date', type: 'timestamp', source: 'supabase-phase9-reports.sql' },
        { name: 'notes', type: 'text', source: 'supabase-phase9-reports.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase-phase9-reports.sql' },
        { name: 'report_id', type: 'uuid', source: 'supabase-phase29-payment-driven-settlement.sql' },
        { name: 'invoice_number', type: 'text', source: 'supabase-phase29-payment-driven-settlement.sql' },
      ],
    },

    {
      name: 'saved_reports',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase9-reports.sql' },
        { name: 'user_id', type: 'uuid', source: 'supabase-phase9-reports.sql' },
        { name: 'name', type: 'text', source: 'supabase-phase9-reports.sql' },
        { name: 'entity_type', type: 'text', source: 'supabase-phase9-reports.sql' },
        { name: 'config', type: 'jsonb', source: 'supabase-phase9-reports.sql' },
      ],
    },

    {
      name: 'commission_reports',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'agent_id', type: 'uuid', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'period_start', type: 'timestamp', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'period_end', type: 'timestamp', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'period_label', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'period_key', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'total_due', type: 'numeric', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'order_count', type: 'integer', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'bonus_count', type: 'integer', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'loose_b2c_count', type: 'integer', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'storage_path', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'drive_file_id', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'drive_view_link', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'email_recipient', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'email_message_id', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'email_sent_at', type: 'timestamp', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'email_error', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'status', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'triggered_by', type: 'uuid', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'trigger_source', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'snapshot_data', type: 'jsonb', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'notes', type: 'text', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase-phase19e-commission-reports.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase-phase19e-commission-reports.sql' },
      ],
      checks: [
        // CHECK constraints declared inline in supabase-phase19e-commission-reports.sql
      ],
    },

    {
      name: 'agent_folders',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'agent_id', type: 'uuid', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'name', type: 'text', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'parent_id', type: 'uuid', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'organization_id', type: 'uuid', source: 'supabase/migrations/20260306_add_org_id_to_agent_folders.sql' },
      ],
    },

    {
      name: 'agent_folder_files',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'folder_id', type: 'uuid', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'name', type: 'text', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'file_path', type: 'text', source: 'supabase-phase12-agent-folders.sql' },
        { name: 'uploaded_by', type: 'uuid', source: 'supabase-phase12-agent-folders.sql' },
      ],
    },

    {
      name: 'event_access',
      columns: [
        { name: 'event_id', type: 'uuid', source: 'supabase-phase14-event-sharing.sql' },
        { name: 'user_id', type: 'uuid', source: 'supabase-phase14-event-sharing.sql' },
        { name: 'user_email', type: 'text', source: 'supabase/migrations/20260818110000_event_access_user_email_compat.sql' },
        { name: 'permission', type: 'text', source: 'supabase-phase14-event-sharing.sql' },
        { name: 'granted_by', type: 'uuid', source: 'supabase-phase14-event-sharing.sql' },
      ],
    },

    {
      name: 'organizations',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'name', type: 'text', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'territory', type: 'text', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'commission_rate', type: 'numeric', source: 'supabase/migrations/20260306_org_management_fields.sql' },
        { name: 'conditions', type: 'text', source: 'supabase/migrations/20260306_org_management_fields.sql' },
        { name: 'deleted_at', type: 'timestamp', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
      ],
    },

    {
      name: 'organization_memberships',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'organization_id', type: 'uuid', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'user_id', type: 'uuid', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'role', type: 'text', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
        { name: 'deleted_at', type: 'timestamp', source: 'supabase/migrations/20260306120000_organization_first_foundation.sql' },
      ],
    },

    {
      name: 'organization_invitations',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260306124000_organization_invitations.sql' },
        { name: 'organization_id', type: 'uuid', source: 'supabase/migrations/20260306124000_organization_invitations.sql' },
        { name: 'email', type: 'text', source: 'supabase/migrations/20260306124000_organization_invitations.sql' },
        { name: 'token', type: 'text', source: 'supabase/migrations/20260306124000_organization_invitations.sql' },
        { name: 'expires_at', type: 'timestamp', source: 'supabase/migrations/20260306124000_organization_invitations.sql' },
      ],
    },

    {
      name: 'consignment_contacts',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260330000000_consignment.sql' },
        { name: 'full_name', type: 'text', source: 'supabase/migrations/20260330000000_consignment.sql' },
        { name: 'company', type: 'text', source: 'supabase/migrations/20260330000000_consignment.sql' },
      ],
    },

    {
      name: 'drafts',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-drafts.sql' },
        { name: 'user_id', type: 'uuid', source: 'supabase-drafts.sql' },
        { name: 'company_name', type: 'text', source: 'supabase-drafts.sql' },
        { name: 'form_state', type: 'jsonb', source: 'supabase-drafts.sql' },
      ],
    },

    {
      name: 'audit_state',
      columns: [
        { name: 'id', type: 'text', source: 'supabase-codify-existing-schema.sql' },
        { name: 'data', type: 'jsonb', source: 'supabase-codify-existing-schema.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase-codify-existing-schema.sql' },
      ],
    },

    {
      name: 'packs',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'label', type: 'text', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'description', type: 'array', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'budget_label', type: 'text', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'fixed_total', type: 'numeric', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'form_rows', type: 'jsonb', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'scope', type: 'text', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'is_seed', type: 'boolean', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase-phase20-custom-packs.sql' },
        { name: 'sort_order', type: 'integer', source: 'supabase-phase33-pack-sort-and-admin-delete.sql' },
      ],
      // Widened in supabase-phase26-pack-visibility.sql to add 'restricted'.
      checks: ['packs_scope_check'],
    },

    {
      name: 'pack_visibility',
      columns: [
        { name: 'pack_id', type: 'uuid', source: 'supabase-phase26-pack-visibility.sql' },
        { name: 'agent_id', type: 'uuid', source: 'supabase-phase26-pack-visibility.sql' },
      ],
    },

    {
      name: 'pack_fairs',
      columns: [
        { name: 'pack_id', type: 'uuid', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'event_id', type: 'uuid', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'sort_order', type: 'integer', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'added_by', type: 'uuid', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase-phase34-pack-fairs.sql' },
      ],
    },

    {
      name: 'pack_hidden',
      columns: [
        { name: 'pack_id', type: 'uuid', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'user_id', type: 'uuid', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase-phase34-pack-fairs.sql' },
      ],
    },

    {
      name: 'pack_pinned',
      columns: [
        { name: 'pack_id', type: 'uuid', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'user_id', type: 'uuid', source: 'supabase-phase34-pack-fairs.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase-phase34-pack-fairs.sql' },
      ],
    },

    {
      name: 'system_health_events',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'source', type: 'text', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'severity', type: 'text', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'message', type: 'text', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'context', type: 'jsonb', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'alerted_at', type: 'timestamp', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'resolved_at', type: 'timestamp', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'resolved_by', type: 'uuid', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'resolved_note', type: 'text', source: 'supabase-phase16-system-health-events.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase-phase16-system-health-events.sql' },
      ],
    },

    // ── LoveLab x IGI certificate module ────────────────────────────────────
    {
      name: 'igi_models',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'serial', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'serial_full', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'name', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'igi_name', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'stones', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'carat', type: 'numeric', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'shape', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'spec', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'state', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'qty_ordered', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'shelf_min', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'pool_min', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'sort_order', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
      ],
      checks: [
        'igi_models_serial_required_when_numbered',
      ],
      uniqueIndexes: [
        { name: 'igi_models_serial_key', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
      ],
    },

    {
      name: 'igi_batches',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'model_id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'qty', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'batch_date', type: 'date', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'reference', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'note', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
      ],
    },

    {
      name: 'igi_visits',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'visit_no', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'visit_date', type: 'date', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'status', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'requested_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'issued_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'closed_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'unattributed_total', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'date_suspect', type: 'boolean', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'note', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'created_by', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'issued_by', type: 'uuid', source: 'supabase/migrations/20260828140000_igi_visit_authorship.sql' },
        { name: 'received_by', type: 'uuid', source: 'supabase/migrations/20260828140000_igi_visit_authorship.sql' },
      ],
    },

    {
      name: 'igi_visit_lines',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'visit_id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'model_id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'qty_requested', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'qty_issued', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'qty_received', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
      ],
    },

    {
      name: 'igi_descriptions',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'description', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'model_id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'kind', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'first_seen_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'last_seen_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'linked_by', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
      ],
      checks: [
        'igi_descriptions_model_only_for_certificates',
      ],
    },

    {
      name: 'igi_shelf_snapshots',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'snapshot_date', type: 'date', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'description', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'total_pcs', type: 'integer', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'model_id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'captured_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
      ],
    },

    {
      name: 'igi_receipts',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'visit_id', type: 'uuid', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'reference', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'status', type: 'text', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'posted_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'response', type: 'jsonb', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
      ],
    },
    {
      name: 'igi_invoices',
      columns: [
        { name: 'id', type: 'uuid', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'period_month', type: 'date', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'igi_reference', type: 'text', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'igi_total_eur', type: 'numeric', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'basis', type: 'text', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'note', type: 'text', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'recorded_by', type: 'uuid', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'created_at', type: 'timestamp', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
        { name: 'updated_at', type: 'timestamp', source: 'supabase/migrations/20260828180000_igi_invoices.sql' },
      ],
    },
  ],

  functions: [
    { name: 'is_admin', source: 'supabase-phase6-fix.sql' },
    { name: 'is_agent', source: 'supabase-phase8-agents.sql' },
    { name: 'revoke_user_sessions', source: 'supabase-phase13-bugfixes.sql' },
    { name: 'handle_updated_at', source: 'supabase-phase4-fixes.sql' },
    { name: 'is_igi', source: 'supabase/migrations/20260828120000_igi_certificates.sql' },
  ],
};

/**
 * Map a column type from `expectedSchema` to a list of postgres data_type
 * substrings that should be considered a match.
 */
export function expectedTypeMatches(expectedType, actualType) {
  if (!actualType) return false;
  const a = String(actualType).toLowerCase();
  switch (expectedType) {
    case 'uuid':
      return a === 'uuid';
    case 'text':
      return a === 'text' || a.startsWith('character');
    case 'integer':
      return a === 'integer' || a === 'bigint' || a === 'smallint';
    case 'numeric':
      return a === 'numeric' || a === 'real' || a === 'double precision';
    case 'jsonb':
      return a === 'jsonb' || a === 'json';
    case 'boolean':
      return a === 'boolean';
    case 'timestamp':
      return a.startsWith('timestamp');
    case 'date':
      return a === 'date';
    default:
      return a.includes(expectedType);
  }
}
