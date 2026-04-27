// Helper for turning an `AsyncIterable<string>` into a `ReadableStream`
// that Next.js Route Handlers can return for SSE.

export function ssEncode(data: string): string {
  // SSE requires each line to be prefixed with `data: ` and events to end
  // with a blank line. We chunk on newlines because raw model output may
  // contain `\n`.
  return data
    .split("\n")
    .map((l) => `data: ${l}`)
    .join("\n")
    .concat("\n\n");
}

export function makeSseStream(deltas: AsyncIterable<string>): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of deltas) {
          controller.enqueue(encoder.encode(ssEncode(delta)));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}
