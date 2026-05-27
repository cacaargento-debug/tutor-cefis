-- Supabase grants EXECUTE to PUBLIC (which includes the anon role) by default.
-- match_document_chunks must only be callable by authenticated users.
REVOKE EXECUTE ON FUNCTION match_document_chunks(vector(768), int, float) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION match_document_chunks(vector(768), int, float) TO authenticated;
