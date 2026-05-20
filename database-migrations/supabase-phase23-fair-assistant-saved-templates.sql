-- User-saved outreach templates so Alberto can keep tweaks he likes and
-- reuse them on future fairs without re-typing or chatting with Claude
-- from scratch every time. Built-in templates in lib/fair-assistant/
-- templates.js stay; these layer on top of them.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.fair_saved_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lead_type text NOT NULL DEFAULT 'shop'
    CHECK (lead_type IN ('shop', 'agent', 'partner', 'other')),
  headline text,
  paragraph1 text,
  paragraph2 text,
  signoff text,
  cta_line text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fair_saved_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fair_saved_templates_admin_all" ON public.fair_saved_templates;
CREATE POLICY "fair_saved_templates_admin_all" ON public.fair_saved_templates
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
