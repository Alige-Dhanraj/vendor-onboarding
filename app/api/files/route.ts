// GET /api/files?path=...: serves uploaded files ONLY in local in-memory mode (no Supabase configured).
// With Supabase, documents are viewed through short-lived signed URLs instead.
import { getStore, storeMode } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (storeMode() !== "memory") return new Response("Not found", { status: 404 });
  const path = new URL(req.url).searchParams.get("path") ?? "";
  try {
    const bytes = await getStore().downloadFile(path);
    const type = path.endsWith(".pdf") ? "application/pdf" : path.endsWith(".png") ? "image/png" : "image/jpeg";
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=300" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
