// Risposte nella forma della Messages API: niente rete, solo JSON.
export function rispostaClaude(o: { testo: string; modello?: string; stop?: string; ingresso?: number; uscita?: number; ricerche?: number; citazioni?: { url: string; title: string }[] }) {
  return Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: o.modello ?? "claude-haiku-4-5-20251001",
    stop_reason: o.stop ?? "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text: o.testo, citations: (o.citazioni ?? []).map((c) => ({ type: "web_search_result_location", url: c.url, title: c.title, cited_text: "", encrypted_index: "x" })) }],
    usage: {
      input_tokens: o.ingresso ?? 1000,
      output_tokens: o.uscita ?? 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      server_tool_use: { web_search_requests: o.ricerche ?? 0 },
    },
  });
}
