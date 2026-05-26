// Simple fixed-size character chunker with overlap. Kept intentionally minimal.
export function chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const step = Math.max(1, chunkSize - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += step) {
    const piece = clean.slice(start, start + chunkSize).trim();
    if (piece) chunks.push(piece);
    if (start + chunkSize >= clean.length) break;
  }
  return chunks;
}
