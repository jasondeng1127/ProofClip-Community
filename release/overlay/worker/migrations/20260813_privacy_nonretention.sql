-- Community 0.7 -> 0.8 upgrade cleanup. Safe on fresh 0.8 databases too:
-- both statements reference columns that exist in the Community 0.8 schema.
-- One-time Notion authorization records are not retained after the flow.
DELETE FROM oauth_states;
-- Connection workspace metadata is never needed to relay evidence; clear it.
UPDATE connections SET workspace_id = NULL, workspace_name = NULL
WHERE workspace_id IS NOT NULL OR workspace_name IS NOT NULL;
