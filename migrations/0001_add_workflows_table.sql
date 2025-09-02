-- Create workflows table for tracking workflow instances
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  vector_id TEXT,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);