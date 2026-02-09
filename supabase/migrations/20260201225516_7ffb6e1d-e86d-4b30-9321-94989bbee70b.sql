-- Enable REPLICA IDENTITY FULL on signals table so UPDATE events include old row data
ALTER TABLE public.signals REPLICA IDENTITY FULL;