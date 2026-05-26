import { describe, it, expect } from "vitest";
import { windowHistory } from "@/lib/history";
import type { ChatMessage } from "@/types";

const msg = (i: number): ChatMessage => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` });

describe("windowHistory", () => {
  it("returns all messages when under the limit", () => {
    const h = [msg(0), msg(1)];
    expect(windowHistory(h, 10)).toHaveLength(2);
  });

  it("keeps only the most recent N messages", () => {
    const h = Array.from({ length: 20 }, (_, i) => msg(i));
    const out = windowHistory(h, 6);
    expect(out).toHaveLength(6);
    expect(out[out.length - 1].content).toBe("m19");
  });
});
