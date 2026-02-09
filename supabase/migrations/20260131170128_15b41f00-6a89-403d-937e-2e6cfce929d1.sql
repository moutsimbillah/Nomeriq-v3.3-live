-- Set FULL replica identity on signals table so realtime UPDATE events include all old values
ALTER TABLE public.signals REPLICA IDENTITY FULL;