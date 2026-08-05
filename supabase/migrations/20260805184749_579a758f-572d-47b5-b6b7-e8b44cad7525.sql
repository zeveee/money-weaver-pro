ALTER TABLE public.asset_valuations
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

UPDATE public.asset_valuations SET is_manual = true WHERE unit_price IS NULL;