-- Quotes are curated content. A quote's category decides which attribution columns it uses.
-- SQLite treats a CHECK that evaluates to NULL as passing, so nullable columns are tested with IS.
CREATE TABLE quotes (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 96 AND id NOT GLOB '*[^a-z0-9-]*'),
  category TEXT NOT NULL CHECK (category IN ('general', 'bible')),
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  author TEXT,
  source TEXT,
  reference TEXT,
  translation TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  CHECK (
    (category = 'general'
      AND author IS NOT NULL AND length(trim(author)) > 0
      AND source IS NOT NULL AND length(trim(source)) > 0
      AND reference IS NULL AND translation IS NULL)
    OR
    (category = 'bible'
      AND reference IS NOT NULL AND length(trim(reference)) > 0
      AND translation IS NOT NULL AND length(trim(translation)) > 0
      AND author IS NULL AND source IS NULL)
  )
) STRICT;

-- One row per publication day (America/New_York). The primary key is what makes publishing
-- idempotent: concurrent writers race on INSERT ... ON CONFLICT DO NOTHING and exactly one wins.
-- Usage counts and last-published dates are derived from this table, never stored separately.
CREATE TABLE publications (
  publish_date TEXT NOT NULL PRIMARY KEY CHECK (date(publish_date) IS publish_date),
  quote_id TEXT NOT NULL REFERENCES quotes (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX publications_by_quote ON publications (quote_id, publish_date);

-- History is permanent.
CREATE TRIGGER publications_cannot_change
BEFORE UPDATE ON publications
BEGIN
  SELECT RAISE(ABORT, 'publications are permanent');
END;

CREATE TRIGGER publications_cannot_be_deleted
BEFORE DELETE ON publications
BEGIN
  SELECT RAISE(ABORT, 'publications are permanent');
END;
