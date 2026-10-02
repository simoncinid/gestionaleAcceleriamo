import { env } from "cloudflare:workers";
import { getRawDb } from "@/lib/data";

export const runtime = "edge";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const doc = await getRawDb()
    .prepare("SELECT name,object_key,content_type,external_url FROM documents WHERE id=?")
    .bind(id)
    .first<{ name: string; object_key: string; content_type: string; external_url: string }>();
  if (!doc) return new Response("Documento non trovato", { status: 404 });

  if (doc.external_url && !doc.object_key) {
    return Response.redirect(doc.external_url, 302);
  }
  if (!env.BUCKET) return new Response("Archivio non disponibile", { status: 503 });
  if (!doc.object_key) return new Response("File non trovato", { status: 404 });
  const object = await env.BUCKET.get(doc.object_key);
  if (!object) {
    if (doc.external_url) return Response.redirect(doc.external_url, 302);
    return new Response("File non trovato", { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    },
  });
}
