CREATE INDEX tasks_live_list_idx ON tasks (list_id, position) WHERE deleted_at IS NULL;
CREATE INDEX lists_live_space_idx ON lists (space_id, position) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX workspace_one_owner_idx ON workspace_members (workspace_id) WHERE role = 'OWNER';
CREATE INDEX tasks_search_idx ON tasks USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));
