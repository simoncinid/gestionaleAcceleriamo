import { env } from "cloudflare:workers";
import { getRawDb } from "@/lib/data";
export const runtime = "edge";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!env.BUCKET) return new Response("Archivio non disponibile", { status: 503 });
  const { id } = await context.params;
  const doc = await getRawDb().prepare("SELECT name,object_key,content_type FROM documents WHERE id=?").bind(id).first<{ name: string; object_key: string; content_type: string }>();
  if (!doc) return new Response("Documento non trovato", { status: 404 });
  const object = await env.BUCKET.get(doc.object_key); if (!object) return new Response("File non trovato", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": doc.content_type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}` } });
}
