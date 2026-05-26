export async function register() {
  // supabase-js eagerly inits a Realtime client that needs a global WebSocket.
  // Node < 22 lacks one; the Edge runtime already has it. Polyfill only on Node.
  if (process.env.NEXT_RUNTIME === "nodejs" && !globalThis.WebSocket) {
    const ws = await import("ws");
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = ws.default;
  }
}
