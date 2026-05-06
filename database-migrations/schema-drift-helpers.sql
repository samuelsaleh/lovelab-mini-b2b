-- =============================================
-- Schema drift helper RPCs
-- =============================================
-- One-time setup. Run this ONCE in the Supabase SQL editor.
-- Creates SECURITY DEFINER functions the schema-drift checker calls to
-- introspect the live database. Read-only; no DDL is performed.
--
-- Used by: scripts/check-schema-drift.mjs
--
-- SAFE TO RE-RUN.

-- 1. List all tables in the public schema.
CREATE OR REPLACE FUNCTION public.__schema_drift_tables()
RETURNS TABLE (table_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT c.relname::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r';
$$;

-- 2. List all columns of public tables.
CREATE OR REPLACE FUNCTION public.__schema_drift_columns()
RETURNS TABLE (
  table_name  text,
  column_name text,
  data_type   text,
  is_nullable text,
  column_default text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog, information_schema
AS $$
  SELECT
    table_name::text,
    column_name::text,
    data_type::text,
    is_nullable::text,
    column_default::text
  FROM information_schema.columns
  WHERE table_schema = 'public';
$$;

-- 3. List all constraints (CHECK, UNIQUE, PRIMARY KEY, FOREIGN KEY).
CREATE OR REPLACE FUNCTION public.__schema_drift_constraints()
RETURNS TABLE (
  table_name      text,
  constraint_name text,
  constraint_type text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog, information_schema
AS $$
  SELECT
    table_name::text,
    constraint_name::text,
    constraint_type::text
  FROM information_schema.table_constraints
  WHERE table_schema = 'public';
$$;

-- 4. List all indexes (with full definition so we can detect partial indexes).
CREATE OR REPLACE FUNCTION public.__schema_drift_indexes()
RETURNS TABLE (
  tablename text,
  indexname text,
  indexdef  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    tablename::text,
    indexname::text,
    indexdef::text
  FROM pg_indexes
  WHERE schemaname = 'public';
$$;

-- 5. List all functions in public.
CREATE OR REPLACE FUNCTION public.__schema_drift_functions()
RETURNS TABLE (proname text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT p.proname::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public';
$$;

-- 6. Lock down execute permissions to service_role only.
-- (PostgREST uses service_role for our drift script; anon/authenticated do
-- not need to introspect the schema.)
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    '__schema_drift_tables',
    '__schema_drift_columns',
    '__schema_drift_constraints',
    '__schema_drift_indexes',
    '__schema_drift_functions'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO service_role', fn);
  END LOOP;
END $$;

-- Verify (run after install):
--   SELECT * FROM public.__schema_drift_tables() ORDER BY 1;
