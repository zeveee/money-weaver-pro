ALTER TABLE public.securities
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS classification_source text,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz;

CREATE INDEX IF NOT EXISTS securities_sector_idx ON public.securities (sector);
CREATE INDEX IF NOT EXISTS securities_country_idx ON public.securities (country);