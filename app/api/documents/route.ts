import { env } from "cloudflare:workers";
import { getRawDb, logActivity, readDashboard, uid } from "@/lib/data";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const rawLead = String(form.get("leadId") || "");
    const rawClient = String(form.get("clientId") || "");
    const leadId = !rawLead || rawLead === "_none" ? "" : rawLead;
    const clientId = !rawClient || rawClient === "_none" ? "" : rawClient;
    const kind = String(form.get("kind") || "altro");
    const externalUrl = String(form.get("externalUrl") || "").trim();
    const actorId = String(form.get("actorId") || "") || null;
    const customName = String(form.get("name") || "").trim();

    if (!leadId && !clientId) return Response.json({ error: "Seleziona un lead o un cliente." }, { status: 400 });
    if (!(file instanceof File) && !externalUrl) return Response.json({ error: "Carica un file oppure inserisci un link (es. Figma)." }, { status: 400 });

    const id = uid();
    let objectKey = "";
    let contentType = "text/uri-list";
    let size = 0;
    let name = customName || "Documento";

    if (file instanceof File && file.size > 0) {
      if (!env.BUCKET) throw new Error("Archivio documenti non disponibile");
      if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Il file supera 20 MB." }, { status: 400 });
      objectKey = `documents/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      await env.BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      contentType = file.type || "application/octet-stream";
      size = file.size;
      name = customName || file.name;
    } else if (externalUrl) {
      name = customName || (kind === "proposta" ? "Proposta Figma" : "Link documento");
    }

    const db = getRawDb();
    await db.prepare(
      "INSERT INTO documents (id,lead_id,client_id,name,object_key,content_type,size,kind,external_url) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(id, leadId || null, clientId || null, name, objectKey, contentType, size, kind || "altro", externalUrl).run();

    if (leadId) {
      await logActivity(db, { entityType: "lead", entityId: leadId, type: "document", title: `Documento: ${name}`, body: kind, actorId });
      if (kind === "riassunto") {
        await db.prepare("UPDATE leads SET status_id=CASE WHEN status_id IN ('presentazione-confermata','appuntamento-confermato') THEN 'in-attesa-preventivo' ELSE status_id END, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(leadId).run();
      }
      if (kind === "proposta" && externalUrl) {
        await db.prepare("UPDATE leads SET proposal_url=?, status_id='in-attesa-decisione', updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(externalUrl, leadId).run();
      }
    }
    if (clientId) {
      await logActivity(db, { entityType: "client", entityId: clientId, type: "document", title: `Documento: ${name}`, body: kind, actorId });
    }

    return Response.json(await readDashboard(db));
  } catch (error) {
    console.error("document_upload_failed", error);
    return Response.json({ error: "Caricamento non riuscito." }, { status: 500 });
  }
}
