-- Phase 12: Agent folder system
-- Run this migration in the Supabase SQL editor.

-- ────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  parent_id  uuid REFERENCES agent_folders(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_folder_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id   uuid NOT NULL REFERENCES agent_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  file_path   text NOT NULL,
  file_size   bigint,
  uploaded_by uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_folders_agent_id   ON agent_folders(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_folders_parent_id  ON agent_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_agent_folder_files_folder ON agent_folder_files(folder_id);

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────

ALTER TABLE agent_folders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_folder_files ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to agent_folders"
  ON agent_folders FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins full access to agent_folder_files"
  ON agent_folder_files FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Agents can see and modify their own folders
CREATE POLICY "Agents access own folders"
  ON agent_folders FOR ALL
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- Agents can see and modify files inside their own folders
CREATE POLICY "Agents access own folder files"
  ON agent_folder_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agent_folders f
      WHERE f.id = folder_id AND f.agent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_folders f
      WHERE f.id = folder_id AND f.agent_id = auth.uid()
    )
  );
