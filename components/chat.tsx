"use client";

import { useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { MessageList } from "@/components/message-list";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Chat() {
  const { messages, send, streaming } = useChat();
  const [input, setInput] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    await send(text);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {messages.length === 0 && (
        <p className="p-6 text-muted-foreground">
          Pergunte algo sobre ICMS, CFOP, CST, SPED Fiscal ou PIS/COFINS.
        </p>
      )}
      <MessageList messages={messages} />
      <form onSubmit={submit} className="flex gap-2 border-t p-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua dúvida fiscal..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
        />
        <Button type="submit" disabled={streaming}>Enviar</Button>
      </form>
    </div>
  );
}
