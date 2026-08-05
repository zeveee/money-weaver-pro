ALTER TABLE public.transactions ALTER COLUMN unit_price TYPE numeric(28,12);
ALTER TABLE public.asset_valuations ALTER COLUMN unit_price TYPE numeric(28,12);
ALTER TABLE public.assets ALTER COLUMN average_cost TYPE numeric(28,12);
ALTER TABLE public.recurring_transactions ALTER COLUMN amount TYPE numeric(20,4);