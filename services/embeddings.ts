import { gemini } from "@/lib/gemini";
import { env, EMBED_DIM } from "@/lib/env";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(texts: string[], attempt = 0): Promise<number[][]> {
  try {
    const res = await gemini().models.embedContent({
      model: env.geminiEmbedModel(),
      contents: texts,
      // gemini-embedding-001 defaults to 3072 dims; pin to our vector(768) column.
      config: { outputDimensionality: EMBED_DIM },
    });
    return (res.embeddings ?? []).map((e) => e.values as number[]);
  } catch (err) {
    if (attempt >= 4) throw err;
    const backoff = 1000 * 2 ** attempt; // 1s,2s,4s,8s — survives free-tier RPM limits
    await sleep(backoff);
    return embedBatch(texts, attempt + 1);
  }
}

// Embeds many texts in small batches to respect free-tier rate limits.
export async function embedTexts(texts: string[], batchSize = 20): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    out.push(...(await embedBatch(batch)));
    if (i + batchSize < texts.length) await sleep(500);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text]);
  return vec;
}
