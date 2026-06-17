-- Operating-object program (backend-first per
-- docs/design/audits/server-object-readiness.md). First object: fund-scoped tasks.
-- Minimal shape: create + list only; lifecycle transitions are a later PR.

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT tasks_status_check CHECK (status IN ('open', 'in_progress', 'done')),
  CONSTRAINT tasks_title_nonempty_check CHECK (length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tasks_fund_created
  ON tasks(fund_id, created_at DESC);
