-- Migration number: 0004	 classification + ownership fields

-- Filled by LLM enrichment (web search) on creation; backfillable per company
ALTER TABLE companies ADD COLUMN country TEXT;   -- e.g. "Switzerland"
ALTER TABLE companies ADD COLUMN sector TEXT;    -- coarse GICS-style bucket

-- Ownership fields (shown for owned/exited companies)
ALTER TABLE companies ADD COLUMN entry_price REAL;
ALTER TABLE companies ADD COLUMN entry_date TEXT;
ALTER TABLE companies ADD COLUMN target_price REAL;
ALTER TABLE companies ADD COLUMN exit_criteria TEXT;  -- living summary of when to exit
