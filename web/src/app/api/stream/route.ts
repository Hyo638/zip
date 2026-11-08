import { store } from "@/lib/store";
import type { Listing } from "@/lib/listing";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const onUpdate = (items: Listing[]) => send("update", items);
      const onPing = (p: unknown) => send("ping", p);
      store.bus.on("update", onUpdate);
      store.bus.on("ping", onPing);
      const keepAlive = setInterval(() => controller.enqueue(enc.encode(": ka\n\n")), 25000);
      send("ping", { lastIngest: store.lastIngest, count: store.listings.size });
      cleanup = () => {
        clearInterval(keepAlive);
        store.bus.off("update", onUpdate);
        store.bus.off("ping", onPing);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {}
      });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
