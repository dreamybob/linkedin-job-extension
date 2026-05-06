CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_url TEXT UNIQUE NOT NULL,
  post_text TEXT,
  poster_name TEXT,
  poster_profile_url TEXT,
  poster_headline TEXT,
  links_in_post TEXT,
  saved_at TEXT,
  is_important INTEGER DEFAULT 0,
  is_irrelevant INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  job_title TEXT,
  company_name TEXT,
  company_linkedin_url TEXT,
  location TEXT,
  remote_status TEXT,
  seniority TEXT,
  domain TEXT,
  compensation TEXT,
  must_have_skills TEXT,
  nice_to_have_skills TEXT,
  experience_years TEXT,
  required_pm_experience TEXT,
  immediate_joiner_preferred INTEGER DEFAULT 0,
  application_method TEXT,
  apply_url TEXT,
  culture_signals TEXT,
  red_flags TEXT,
  fitment_score INTEGER,
  fitment_summary TEXT,
  strong_matches TEXT,
  gaps TEXT,
  mandatory_qualification_missing INTEGER DEFAULT 0,
  mandatory_qualification_reasons TEXT,
  mandatory_qualification_details TEXT,
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

CREATE TABLE IF NOT EXISTS structured_resume_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_version TEXT UNIQUE NOT NULL,
  resume_row_id INTEGER REFERENCES resume(id) ON DELETE SET NULL,
  filename TEXT,
  raw_text_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS structured_resume_sections (
  id TEXT PRIMARY KEY,
  resume_version TEXT NOT NULL REFERENCES structured_resume_versions(resume_version) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS structured_resume_entries (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES structured_resume_sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  date_range TEXT,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS structured_resume_bullets (
  id TEXT PRIMARY KEY,
  section_id TEXT REFERENCES structured_resume_sections(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES structured_resume_entries(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_review_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  resume_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_score INTEGER,
  score_breakdown TEXT NOT NULL DEFAULT '{}',
  keyword_summary TEXT NOT NULL DEFAULT '{}',
  top_issues TEXT NOT NULL DEFAULT '[]',
  top_opportunities TEXT NOT NULL DEFAULT '[]',
  overall_summary TEXT,
  error_message TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, resume_version)
);

CREATE TABLE IF NOT EXISTS resume_review_analysis_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES resume_review_analysis(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  parent_section_id TEXT,
  parent_entry_id TEXT,
  annotation_type TEXT,
  score INTEGER,
  score_impact INTEGER,
  explanation TEXT,
  keywords_matched TEXT NOT NULL DEFAULT '[]',
  keywords_missing TEXT NOT NULL DEFAULT '[]',
  suggestion_summary TEXT,
  UNIQUE(analysis_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS resume_review_suggestions (
  id TEXT PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  resume_version TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  overlay_revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, resume_version, target_type, target_id, overlay_revision)
);

CREATE TABLE IF NOT EXISTS resume_review_overlays (
  id TEXT PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  resume_version TEXT NOT NULL,
  source_target_type TEXT NOT NULL,
  source_target_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  section_id TEXT,
  entry_id TEXT,
  operation TEXT NOT NULL,
  suggestion_id TEXT,
  original_text TEXT,
  applied_text TEXT NOT NULL,
  score_delta INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  reverted_at TEXT
);
