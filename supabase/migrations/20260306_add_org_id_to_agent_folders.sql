-- Add organization_id to agent_folders for direct org-to-folder mapping.
-- Prevents folder collisions when two orgs share the same owner or name.
ALTER TABLE agent_folders ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Backfill existing folders: join through profiles to find the org
UPDATE agent_folders af
SET organization_id = p.organization_id
FROM profiles p
WHERE af.agent_id = p.id
  AND p.organization_id IS NOT NULL
  AND af.organization_id IS NULL;

-- Index for fast lookups by organization
CREATE INDEX IF NOT EXISTS idx_agent_folders_organization_id ON agent_folders(organization_id);
