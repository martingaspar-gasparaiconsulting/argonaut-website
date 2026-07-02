-- ============================================================
-- ARGONAUT OS · RAG · match_document_chunks
-- Echter DB-Stand (Export 02.07.26). Idempotent (CREATE OR REPLACE).
-- Fix: expliziter vector(1024)-Cast in plpgsql (declare q vector(1024)),
--      behebt den untypisierten vector-Parameter-Bug aus Modul 5.
-- Verwendet von: RAG-Pipeline (Voyage voyage-4-lite -> dieser RPC -> Claude).
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector,
  match_user_id uuid,
  match_count integer DEFAULT 5,
  match_threshold double precision DEFAULT 0.3
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
AS $function$
declare
  q vector(1024);
begin
  q := query_embedding::vector(1024);
  return query
    select
      dc.id,
      dc.document_id,
      dc.content,
      dc.chunk_index,
      (1 - (dc.embedding <=> q))::double precision as similarity
    from public.document_chunks dc
    where dc.user_id = match_user_id
      and (1 - (dc.embedding <=> q)) >= match_threshold
    order by dc.embedding <=> q asc
    limit match_count;
end;
$function$;
