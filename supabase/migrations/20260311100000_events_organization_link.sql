-- Link agent-type events to organizations so documents appear in agent folders
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_events_organization_id ON public.events(organization_id) WHERE organization_id IS NOT NULL;
