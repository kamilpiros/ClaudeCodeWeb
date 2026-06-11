-- Migration number: 0003	 intelligence: horizons, reminders, earnings, prices

-- Long-term hold vs short-term tactical trade ('core' | 'tactical')
ALTER TABLE companies ADD COLUMN horizon TEXT;
-- Next earnings date, researched via web search at capture time
ALTER TABLE companies ADD COLUMN next_earnings_date TEXT;
-- First observed price after the company entered the pipeline — the
-- reference point for "how has it moved since I added it"
ALTER TABLE companies ADD COLUMN baseline_price REAL;
ALTER TABLE companies ADD COLUMN baseline_price_date TEXT;

-- Dated to-dos ("buy calls before earnings", "re-check after H1 numbers").
-- Undated to-dos stay in action_items; anything with a deadline lives here.
CREATE TABLE reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  note_id INTEGER REFERENCES notes(id),
  body TEXT NOT NULL,
  due_date TEXT,              -- ISO date; NULL = undated follow-up
  trigger TEXT,               -- 'earnings' when anchored to the next earnings date
  done INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  done_at TEXT
);
CREATE INDEX idx_reminders_due ON reminders(done, due_date);

-- 15-minute quote cache (Yahoo Finance chart API, best effort)
CREATE TABLE quotes (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id),
  price REAL,
  currency TEXT,
  prev_close REAL,
  fetched_at TEXT NOT NULL
);
