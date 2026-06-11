CREATE TABLE IF NOT EXISTS drama (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(120) NOT NULL,
  description TEXT,
  cover_url VARCHAR(500),
  wide_cover_url VARCHAR(500) DEFAULT '',
  categories_json TEXT DEFAULT '[]',
  cast_tags_json TEXT DEFAULT '[]',
  status VARCHAR(32) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(256) NOT NULL,
  role VARCHAR(32) DEFAULT 'uploader',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS episode (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL,
  owner_user_id INTEGER,
  episode_no INTEGER NOT NULL,
  title VARCHAR(120) NOT NULL,
  video_url VARCHAR(500) NOT NULL,
  video_original_name VARCHAR(255),
  subtitle_url VARCHAR(500),
  subtitle_original_name VARCHAR(255),
  subtitle_content TEXT,
  duration REAL DEFAULT 0,
  asset_status VARCHAR(32) DEFAULT 'draft',
  video_width INTEGER DEFAULT 0,
  video_height INTEGER DEFAULT 0,
  video_file_size INTEGER DEFAULT 0,
  video_mime_type VARCHAR(120) DEFAULT '',
  analyze_status VARCHAR(32) DEFAULT 'pending',
  analyze_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (drama_id) REFERENCES drama(id),
  FOREIGN KEY (owner_user_id) REFERENCES user_account(id)
);

CREATE TABLE IF NOT EXISTS highlight_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  highlight_type VARCHAR(32) NOT NULL,
  emotion VARCHAR(64),
  intensity REAL DEFAULT 0.5,
  confidence REAL DEFAULT 0.5,
  trigger_score REAL DEFAULT 0.5,
  reason TEXT,
  button_text VARCHAR(120),
  effect VARCHAR(64),
  status VARCHAR(32) DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episode(id)
);

CREATE TABLE IF NOT EXISTS interaction_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  highlight_type VARCHAR(32) NOT NULL UNIQUE,
  button_text VARCHAR(120) NOT NULL,
  effect VARCHAR(64) NOT NULL,
  position VARCHAR(32) DEFAULT 'bottom',
  duration_ms INTEGER DEFAULT 4000,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_interaction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id VARCHAR(120) NOT NULL,
  episode_id INTEGER NOT NULL,
  highlight_id INTEGER NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  action_value VARCHAR(120),
  watch_time REAL DEFAULT 0,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episode(id),
  FOREIGN KEY (highlight_id) REFERENCES highlight_event(id)
);

CREATE TABLE IF NOT EXISTS job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type VARCHAR(64) NOT NULL,
  status VARCHAR(32) DEFAULT 'pending',
  progress REAL DEFAULT 0,
  payload_json TEXT DEFAULT '{}',
  rq_job_id VARCHAR(160),
  started_at DATETIME,
  finished_at DATETIME,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  level VARCHAR(32) DEFAULT 'info',
  message TEXT NOT NULL,
  context_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job(id)
);

CREATE TABLE IF NOT EXISTS publish_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel VARCHAR(32) DEFAULT 'android',
  status VARCHAR(32) DEFAULT 'pending',
  scheduled_at DATETIME,
  created_by_user_id INTEGER,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES user_account(id)
);

CREATE TABLE IF NOT EXISTS publish_job_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publish_job_id INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  status VARCHAR(32) DEFAULT 'pending',
  error TEXT,
  published_highlight_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publish_job_id) REFERENCES publish_job(id),
  FOREIGN KEY (episode_id) REFERENCES episode(id)
);

CREATE TABLE IF NOT EXISTS system_setting (
  key VARCHAR(120) PRIMARY KEY,
  value_json TEXT DEFAULT '{}',
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_user_id) REFERENCES user_account(id)
);

CREATE INDEX IF NOT EXISTS idx_episode_drama ON episode(drama_id);
CREATE INDEX IF NOT EXISTS idx_episode_owner_user ON episode(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_episode_asset_status ON episode(asset_status);
CREATE INDEX IF NOT EXISTS idx_episode_analyze_status ON episode(analyze_status);
CREATE INDEX IF NOT EXISTS idx_user_account_username ON user_account(username);
CREATE INDEX IF NOT EXISTS idx_highlight_episode_status ON highlight_event(episode_id, status);
CREATE INDEX IF NOT EXISTS idx_interaction_episode_action ON user_interaction_log(episode_id, action_type);
CREATE INDEX IF NOT EXISTS idx_job_type ON job(type);
CREATE INDEX IF NOT EXISTS idx_job_status ON job(status);
CREATE INDEX IF NOT EXISTS idx_job_rq_job_id ON job(rq_job_id);
CREATE INDEX IF NOT EXISTS idx_job_log_job ON job_log(job_id);
CREATE INDEX IF NOT EXISTS idx_publish_job_channel ON publish_job(channel);
CREATE INDEX IF NOT EXISTS idx_publish_job_status ON publish_job(status);
CREATE INDEX IF NOT EXISTS idx_publish_job_created_by ON publish_job(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_publish_job_item_job ON publish_job_item(publish_job_id);
CREATE INDEX IF NOT EXISTS idx_publish_job_item_episode ON publish_job_item(episode_id);
CREATE INDEX IF NOT EXISTS idx_publish_job_item_status ON publish_job_item(status);
CREATE INDEX IF NOT EXISTS idx_system_setting_updated_by ON system_setting(updated_by_user_id);
