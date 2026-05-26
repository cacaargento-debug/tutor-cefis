import { embedQuery } from "@/services/embeddings";
import { createClient } from "@/lib/supabase/server";
import type { RetrievedChunk } from "@/types";

export async function retrieveContext(
  query: string,
  matchCount = 5,
  threshold = 0.45
): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedding,
    match_count: matchCount,
    similarity_threshold: threshold,
  });
  if (error) {
    console.error("RAG retrieval failed:", error.message);
    return [];
  }
  return (data ?? []) as RetrievedChunk[];
}

export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "Nenhum material CEFIS relevante encontrado.";
  return chunks
    .map((c, i) => `[Trecho ${i + 1}]\n${c.content}`)
    .join("\n\n");
}
