ALTER TABLE investments ADD CONSTRAINT investments_id_fund_id_key UNIQUE (id, fund_id);
