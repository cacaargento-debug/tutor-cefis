import { config } from "dotenv";
import ws from "ws";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { chunkText } from "@/lib/chunk";
import { embedTexts } from "@/services/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

// Next.js auto-loads .env.local, but this standalone tsx script does not.
config({ path: path.join(process.cwd(), ".env.local") });

// supabase-js eagerly inits a Realtime client needing a global WebSocket,
// which Node < 22 lacks. Polyfill before creating any Supabase client.
if (!globalThis.WebSocket) {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = ws;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "fiscal");

async function main() {
  const db = createAdminClient();

  // Clear prior data so re-runs replace the index instead of appending
  // duplicates (chunks cascade-delete with their documents).
  const { error: clearErr } = await db
    .from("documents")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (clearErr) throw clearErr;

  const files = (await readdir(CONTENT_DIR)).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const title = file.replace(/\.md$/, "");

    const { data: doc, error: docErr } = await db
      .from("documents")
      .insert({ source: file, title, metadata: { area: "fiscal" } })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const chunks = chunkText(raw);
    const vectors = await embedTexts(chunks);

    const rows = chunks.map((content, i) => ({
      document_id: doc.id,
      content,
      embedding: vectors[i],
      metadata: { area: "fiscal", title },
    }));

    const { error: chunkErr } = await db.from("document_chunks").insert(rows);
    if (chunkErr) throw chunkErr;

    console.log(`Ingested ${file}: ${chunks.length} chunks`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
