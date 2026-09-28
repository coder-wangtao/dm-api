-- Request-log policy metadata. Existing rows remain detailed for compatibility.
ALTER TABLE request_logs ADD COLUMN detail_level TEXT NOT NULL DEFAULT 'detailed';
ALTER TABLE request_logs ADD COLUMN started_at TEXT;

CREATE INDEX IF NOT EXISTS idx_logs_started ON request_logs(started_at);
