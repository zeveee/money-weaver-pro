CREATE TABLE public.security_lookup_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lookup_key text NOT NULL REFERENCES public.security_lookups(lookup_key) ON DELETE CASCADE,
  security_id uuid NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (lookup_key, security_id)
);

CREATE INDEX idx_slc_lookup_key ON public.security_lookup_candidates(lookup_key);
CREATE INDEX idx_slc_security_id ON public.security_lookup_candidates(security_id);

GRANT SELECT ON public.security_lookup_candidates TO authenticated;
GRANT ALL ON public.security_lookup_candidates TO service_role;

ALTER TABLE public.security_lookup_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read lookup candidates"
ON public.security_lookup_candidates
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.security_lookup_candidates (lookup_key, security_id)
SELECT lookup_key, security_id
FROM public.security_lookups
WHERE security_id IS NOT NULL
ON CONFLICT (lookup_key, security_id) DO NOTHING;