ALTER TABLE hook_events ADD COLUMN tool_result_stdout TEXT;
ALTER TABLE hook_events ADD COLUMN tool_result_stderr TEXT;
ALTER TABLE hook_events ADD COLUMN duration_ms INTEGER;
