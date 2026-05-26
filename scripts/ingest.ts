import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { chunkText } from "@/lib/chunk";
import { embedTexts } from "@/services/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTENT_DIR = path.join(process.cwd(), "content", "fiscal");

async function main() {
  const db = createAdminClient();
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
