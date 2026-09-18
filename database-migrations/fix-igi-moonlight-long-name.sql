-- Fix leftover old IGI model names that block Certificate In to LoveLab.
-- Run in Supabase SQL, then re-run the B2B cron.

UPDATE public.igi_models
SET name = 'Cuty / Cubix / Long Moonlight', updated_at = now()
WHERE serial = 'LGAJ6529'
  AND name IS DISTINCT FROM 'Cuty / Cubix / Long Moonlight';

UPDATE public.igi_models
SET name = 'Cuty / Cubix / Sienna 1 / Original Moonlight / Long Moonlight', updated_at = now()
WHERE serial IN ('LGAJ6530', 'LGAJ6532')
  AND name IS DISTINCT FROM 'Cuty / Cubix / Sienna 1 / Original Moonlight / Long Moonlight';

UPDATE public.igi_models
SET name = 'Cuty / Cubix / Sienna 1 / Original Moonlight', updated_at = now()
WHERE serial = 'LGAJ6531'
  AND name IS DISTINCT FROM 'Cuty / Cubix / Sienna 1 / Original Moonlight';

-- Force LGAJ6532 even if it has a weird intermediate name
UPDATE public.igi_models
SET name = 'Cuty / Cubix / Sienna 1 / Original Moonlight / Long Moonlight', updated_at = now()
WHERE serial = 'LGAJ6532';

SELECT serial, name FROM public.igi_models
WHERE serial IN ('LGAJ6529','LGAJ6530','LGAJ6531','LGAJ6532')
ORDER BY serial;
