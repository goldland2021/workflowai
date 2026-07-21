-- Store the latest verified flight arrival enrichment on the booking.
-- Run after 011_structured_memory_and_learning.sql.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS flight_arrival JSONB;
