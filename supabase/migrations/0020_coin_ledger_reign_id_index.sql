-- ============================================================================
-- 0020 — Index the coin_ledger.reign_id foreign key, so deleting a reign
-- (ON DELETE SET NULL) doesn't scan the whole ledger.
-- ============================================================================

CREATE INDEX coin_ledger_reign_id_idx ON public.coin_ledger (reign_id);
