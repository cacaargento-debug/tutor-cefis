import { createClient } from "@/lib/supabase/server";
import { gemini } from "@/lib/gemini";
import { env } from "@/lib/env";
import { retrieveContext, formatContext } from "@/services/rag";
import { buildSystemPrompt } from "@/prompts/tutor";
import { windowHistory } from "@/lib/history";
import type { ChatMessage, LearningProfile } from "@/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { sessionId, messages } = (await req.json()) as {
    sessionId?: string;
    messages: ChatMessage[];
  };
  const history = windowHistory(messages, 10);
  const lastUser = history[history.length - 1];
  if (!lastUser || lastUser.role !== "user") {
    return new Response("Bad Request", { status: 400 });
  }

  // Ensure a chat session exists (created lazily on first message).
  let sid = sessionId;
  if (!sid) {
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: lastUser.content.slice(0, 60) })
      .select("id")
      .single();
    if (error) return new Response(error.message, { status: 500 });
    sid = data.id;
  }

  // Persist the user message BEFORE streaming.
  const { error: userMsgError } = await supabase
    .from("chat_messages")
    .insert({ session_id: sid, role: "user", content: lastUser.content });
  if (userMsgError) return new Response(userMsgError.message, { status: 500 });

  const { data: profileRow } = await supabase
    .from("learning_profiles")
    .select("goal, level, study_time, learning_style")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = (profileRow ?? null) as LearningProfile | null;

  const chunks = await retrieveContext(lastUser.content);
  const systemPrompt = buildSystemPrompt(profile, formatContext(chunks));

  const contents = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const geminiStream = await gemini().models.generateContentStream({
    model: env.geminiModel(),
    contents,
    config: { systemInstruction: systemPrompt, temperature: 0.5 },
  });

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      let errored = false;
      try {
        for await (const chunk of geminiStream) {
          const text = chunk.text ?? "";
          if (text) {
            full += text;
            controller.enqueue(encoder.encode(text));
          }
        }
      } catch (err) {
        errored = true;
        controller.error(err);
      } finally {
        // Persist assistant reply even if the client disconnected.
        if (full) {
          const { error: assistantMsgError } = await supabase
            .from("chat_messages")
            .insert({ session_id: sid, role: "assistant", content: full });
          if (assistantMsgError) {
            console.error("Failed to persist assistant message:", assistantMsgError.message);
          }
        }
        // Stream is already errored on the failure path; only close on success.
        if (!errored) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-session-id": sid!,
    },
  });
}
