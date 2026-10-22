DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fleet_years') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_years;
  END IF;
END $$;