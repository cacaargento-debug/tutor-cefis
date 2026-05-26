import type { ChatMessage } from "@/types";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m, i) => (
        <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
          <div
            className={
              "inline-block max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm " +
              (m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")
            }
          >
            {m.content || "…"}
          </div>
        </div>
      ))}
    </div>
  );
}
