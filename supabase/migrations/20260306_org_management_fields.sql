-- Add org-level commission rate and conditions to organizations table.
-- These serve as defaults for all agents in the org; individual agent overrides
-- are still possible via profiles.commission_rate.

alter table organizations
  add column if not exists commission_rate numeric(5,2) default null
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100));

alter table organizations
  add column if not exists conditions text default null;
