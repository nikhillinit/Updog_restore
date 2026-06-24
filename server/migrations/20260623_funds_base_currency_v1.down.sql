DO $$
DECLARE non_usd integer;
BEGIN
  SELECT count(*) INTO non_usd FROM funds WHERE base_currency <> 'USD';
  IF non_usd > 0 THEN
    RAISE EXCEPTION 'Cannot drop funds.base_currency: % funds have non-USD currency', non_usd;
  END IF;
END $$;
ALTER TABLE funds DROP COLUMN IF EXISTS base_currency;
