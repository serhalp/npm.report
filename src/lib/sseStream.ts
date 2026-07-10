/* eslint-disable no-await-in-loop -- SSE frames must be read from the stream sequentially as they arrive. */
// Shared SSE reader for the server-run audit + user-publishes streams. Reads an
// event stream, reassembling frames across chunk boundaries, and invokes
// `onFrame` with each parsed `event` name and JSON `data`. Frames whose data
// isn't valid JSON are skipped.
export interface SseFrame {
  event: string;
  data: unknown;
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (raw: string) => {
    let event = "message";
    let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trimStart();
    }
    if (!data) return;
    try {
      onFrame({ event, data: JSON.parse(data) });
    } catch {
      // ignore a frame with unparseable data
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      flush(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
    }
  }
  if (buffer.trim()) flush(buffer);
}
