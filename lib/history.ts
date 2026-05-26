import type { ChatMessage } from "@/types";

export function windowHistory(messages: ChatMessage[], max = 10): ChatMessage[] {
  return messages.slice(-max);
}
