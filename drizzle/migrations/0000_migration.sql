CREATE TABLE public.fleet_years (
  year integer PRIMARY KEY,
  closed boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{"devices":[]}'::jsonb,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fleet_years TO anon, authenticated;
GRANT ALL ON public.fleet_years TO service_role;
ALTER TABLE public.fleet_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read" ON public.fleet_years FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert open year" ON public.fleet_years FOR INSERT TO anon, authenticated WITH CHECK (closed = false);
CREATE POLICY "update only open year" ON public.fleet_years FOR UPDATE TO anon, authenticated USING (closed = false) WITH CHECK (true);