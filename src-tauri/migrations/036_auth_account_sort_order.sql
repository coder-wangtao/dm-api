-- 036: Add sort_order to auth_accounts for manual drag-and-drop ordering
ALTER TABLE auth_accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_auth_accounts_sort_order
    ON auth_accounts(sort_order, created_at, id);
