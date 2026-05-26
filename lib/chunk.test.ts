import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/chunk";

describe("chunkText", () => {
  it("returns one chunk when text is shorter than the chunk size", () => {
    expect(chunkText("hello world", 100, 10)).toEqual(["hello world"]);
  });

  it("splits long text into overlapping chunks", () => {
    const text = "a".repeat(250);
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBe(3); // step = 80 -> starts 0,80,160
    expect(chunks[0].length).toBe(100);
    expect(chunks[1].startsWith("a")).toBe(true);
  });

  it("drops empty/whitespace-only trailing chunks", () => {
    expect(chunkText("   ", 100, 10)).toEqual([]);
  });
});
