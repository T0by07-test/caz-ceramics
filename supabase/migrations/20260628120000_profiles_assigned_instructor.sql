-- Add assigned_instructor to profiles so each student can be linked to their default teacher.
-- Used by VoiceFAB to auto-fill the collector field when a student is selected.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_instructor text;
