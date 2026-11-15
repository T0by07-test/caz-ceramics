ALTER TABLE public.workshops
  ADD COLUMN is_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workshops.is_completed IS 'Whether the workshop has already taken place; reversible from the admin workshop list.';