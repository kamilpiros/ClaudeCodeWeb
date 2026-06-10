-- Migration number: 0001	 init
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ticker TEXT,                -- e.g. "1846.HK", "EVC", "3661.T"
  exchange TEXT,
  market_cap_musd REAL,       -- rough, at time of entry; not live data
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',
    -- one of: inbox | dismissed | quick_look | worked | watchlist | owned | exited
  pass_reason TEXT,           -- why dismissed/passed (3 words to 2 sentences)
  conviction INTEGER,         -- 1-5, nullable
  source TEXT,                -- substack | twitter | microcapclub | yellowbrick | person | own | other
  source_detail TEXT,         -- e.g. person's name, substack name, URL
  koyfin_url TEXT,            -- auto-generated, editable
  model_url TEXT,             -- OneDrive link to Excel model, nullable
  model_updated_at TEXT,      -- ISO date, manually set or via API (Phase 3)
  substack_url TEXT,          -- link to own write-up if published
  ir_subscribed INTEGER DEFAULT 0,   -- 0=no/unknown, 1=yes
  ir_email_used TEXT,         -- which email was used to subscribe
  ir_notes TEXT,              -- e.g. "ambush announcer, no pre-announcement"
  aliases TEXT,               -- JSON array of strings, e.g. ["P&C","Peek & Cloppenburg"]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),  -- NULL = unattached musing
  note_type TEXT NOT NULL DEFAULT 'note',
    -- one of: note | thesis_update | exit_criteria | meeting | musing | post_mortem
  body TEXT NOT NULL,
  raw_transcript TEXT,        -- original voice/text input before LLM cleanup
  created_at TEXT NOT NULL
);

CREATE TABLE action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),  -- nullable
  note_id INTEGER REFERENCES notes(id),         -- which capture spawned it
  body TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  done_at TEXT
);

CREATE TABLE status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_ticker ON companies(ticker);
CREATE INDEX idx_notes_company_id ON notes(company_id);
CREATE INDEX idx_notes_created_at ON notes(created_at);
CREATE INDEX idx_action_items_done ON action_items(done);
