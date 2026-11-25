-- AI OS Companion: Cloudflare D1 Schema (индексирована под лимиты Free Tier)

CREATE TABLE IF NOT EXISTS pet_profile (
  profile_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Безымянный',
  stage TEXT NOT NULL DEFAULT 'egg',
  xp INTEGER NOT NULL DEFAULT 0,
  mood TEXT NOT NULL DEFAULT 'normal',
  skin TEXT NOT NULL DEFAULT 'robot',
  ui_theme TEXT NOT NULL DEFAULT 'cyber',
  traits_json TEXT NOT NULL DEFAULT '{"humor":6,"sass":4,"care":8,"concise":7}',
  state_rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS memory_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL DEFAULT 'default',
  category TEXT NOT NULL DEFAULT 'user',
  fact_text TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_facts_lookup ON memory_facts(profile_id, weight DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS episode_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL DEFAULT 'default',
  day_key TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_summaries_lookup ON episode_summaries(profile_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL DEFAULT 'default',
  role TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'system',
  model TEXT NOT NULL DEFAULT 'none',
  mood TEXT NOT NULL DEFAULT 'normal',
  content TEXT NOT NULL,
  summarized INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chat_recent ON chat_messages(profile_id, summarized, id DESC);

CREATE TABLE IF NOT EXISTS lessons_learned (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL DEFAULT 'default',
  mistake_note TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_lessons_lookup ON lessons_learned(profile_id, id DESC);

INSERT OR IGNORE INTO pet_profile (profile_id, name, stage, xp, mood, skin, ui_theme)
VALUES ('default', 'Яйцо', 'egg', 0, 'normal', 'robot', 'cyber');
