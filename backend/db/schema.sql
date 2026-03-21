CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_url TEXT UNIQUE NOT NULL,
  post_text TEXT,
  poster_name TEXT,
  poster_profile_url TEXT,
  poster_headline TEXT,
  links_in_post TEXT,
  saved_at TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  job_title TEXT,
  company_name TEXT,
  location TEXT,
  remote_status TEXT,
  seniority TEXT,
  domain TEXT,
  compensation TEXT,
  must_have_skills TEXT,
  nice_to_have_skills TEXT,
  experience_years TEXT,
  culture_signals TEXT,
  red_flags TEXT,
  fitment_score INTEGER,
  fitment_summary TEXT,
  strong_matches TEXT,
  gaps TEXT,
  angles_to_emphasize TEXT,
  outreach_talking_points TEXT,
  linked_content TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  raw_text TEXT,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

