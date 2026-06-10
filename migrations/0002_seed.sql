-- Migration number: 0002	 seed live names so day-one matching works.
-- Statuses are editable in the app; market caps intentionally left NULL
-- (rough figures get filled in at capture/edit time, never live data).

INSERT INTO companies (name, ticker, exchange, currency, status, koyfin_url, aliases, created_at, updated_at) VALUES
  ('EuroEyes International Eye Clinic', '1846.HK', 'HKEX',   'HKD', 'owned',     'https://app.koyfin.com/company/1846.hk',  '["1846","EuroEyes"]',          strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Entravision Communications',       'EVC',     'NYSE',    'USD', 'owned',     'https://app.koyfin.com/company/evc',      '["Smadex","Entravision"]',     strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('M-up Holdings',                    '3661.T',  'TSE',     'JPY', 'owned',     'https://app.koyfin.com/company/3661.t',   '["3661","mup","M-up"]',        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Tonies SE',                        'TNIE',    'XETRA',   'EUR', 'owned',     'https://app.koyfin.com/company/tnie',     '["Tonies","Toniebox"]',        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Gulf Marine Services',             'GMS',     'LSE',     'GBP', 'owned',     'https://app.koyfin.com/company/gms',      '["GMS"]',                      strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Minera Alamos',                    'MAI',     'TSXV',    'CAD', 'owned',     'https://app.koyfin.com/company/mai',      '["Minera"]',                   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Journey Energy',                   'JOY',     'TSX',     'CAD', 'owned',     'https://app.koyfin.com/company/joy',      '["Journey"]',                  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('NobleOak Life',                    'NOL.AX',  'ASX',     'AUD', 'owned',     'https://app.koyfin.com/company/nol.ax',   '["NobleOak","NOL"]',           strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Sportradar Group',                 'SRAD',    'NASDAQ',  'USD', 'owned',     'https://app.koyfin.com/company/srad',     '["Sportradar"]',               strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Nestle',                           'NESN.SW', 'SIX',     'CHF', 'watchlist', 'https://app.koyfin.com/company/nesn.sw',  '["Nestlé","NESN"]',            strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO status_history (company_id, from_status, to_status, changed_at)
SELECT id, NULL, status, created_at FROM companies;
