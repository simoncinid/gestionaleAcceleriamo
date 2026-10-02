import { env } from "cloudflare:workers";
import { getRawDb, readDashboard, uid } from "@/lib/data";
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    if (!env.BUCKET) throw new Error("Archivio documenti non disponibile");
    const form = await request.formData(); const file = form.get("file");
    const leadId = String(form.get("leadId") || ""); const clientId = String(form.get("clientId") || "");
    if (!(file instanceof File) || (!leadId && !clientId)) return Response.json({ error: "Seleziona un file e un contatto." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Il file supera 20 MB." }, { status: 400 });
    const id = uid(); const key = `documents/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    const db = getRawDb();
    await db.prepare("INSERT INTO documents (id,lead_id,client_id,name,object_key,content_type,size) VALUES (?,?,?,?,?,?,?)")
      .bind(id, leadId || null, clientId || null, file.name, key, file.type || "application/octet-stream", file.size).run();
    return Response.json(await readDashboard(db));
  } catch (error) { console.error("document_upload_failed", error); return Response.json({ error: "Caricamento non riuscito." }, { status: 500 }); }
}
