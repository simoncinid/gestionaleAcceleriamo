// Prima di ogni giro: migrazioni e dati finti nel D1 locale della demo, con l'ora fissa delle foto.
import { execFileSync } from "node:child_process";
import { ORA_DEMO, PASSWORD_DEMO } from "./controlli";

export default function prepara() {
  const opz = { stdio: "inherit" as const, env: { ...process.env, DEMO_ORA: String(ORA_DEMO), DEMO_PASSWORD: PASSWORD_DEMO } };
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "acceleriamo-os-demo", "--env", "demo", "--local"], opz);
  execFileSync("npx", ["tsx", "scripts/seed-demo.ts", "--local"], opz);
  // Risorsa di prova per la pagina pubblica /r/prova (il seed della demo non ne ha).
  const risorsa = "INSERT OR REPLACE INTO risorse (slug, titolo, sottotitolo, corpo, pdf_url, attiva, creata_il) VALUES ('prova', 'lo schema del workflow', 'Come rispondere ai commenti senza perdere un contatto', 'Un commento arriva, il messaggio parte da solo.\n\n- Commenti letti\n- Risposta pubblica\n- Messaggio privato con la guida', 'https://example.com/scheda.pdf', 1, 1)";
  execFileSync("npx", ["wrangler", "d1", "execute", "acceleriamo-os-demo", "--env", "demo", "--local", "--command", risorsa], opz);
  // Risorsa con uno schema a passi lungo: i link del messaggio su Instagram aprono /r/prova-schema#passo-N e #chiamata.
  const passi = Array.from({ length: 7 }, (_, i) => `${i + 1}. **Passo numero ${i + 1}.** ${"Una descrizione che occupa spazio sullo schermo del telefono. ".repeat(3)}`).join("\n");
  const schema = `INSERT OR REPLACE INTO risorse (slug, titolo, sottotitolo, corpo, pdf_url, attiva, creata_il) VALUES ('prova-schema', 'Lo schema dei passi', 'Sette passi', '## Lo schema\n\n${passi}\n\nUltimo paragrafo.', NULL, 1, 1)`;
  execFileSync("npx", ["wrangler", "d1", "execute", "acceleriamo-os-demo", "--env", "demo", "--local", "--command", schema], opz);
  // Risponditore (Task 8): un account, due campagne, commenti nei vari stati, una richiesta di chiamata. Ore fisse sull'ora delle foto.
  const m = (minuti: number) => ORA_DEMO - minuti * 60_000;
  const risponditore = [
    `INSERT OR REPLACE INTO ig_account (id, ig_user_id, username, token_cifrato, scade_il, rinnovato_il, ultimo_errore) VALUES ('principale', '17841400000000000', 'acceleriamo.it', 'solo-per-la-demo', ${ORA_DEMO + 45 * 86_400_000}, ${m(15 * 1440)}, NULL)`,
    `INSERT OR REPLACE INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) VALUES ('demo-camp-1', 'Schema del workflow', 'workflow', NULL, '["Ti ho scritto in privato","Controlla i messaggi"]', 'Ciao, ecco lo schema che hai chiesto.', 'Mandami il link', 'prova', 'Eccolo, buona lettura.', 1, ${m(3 * 1440)})`,
    `INSERT OR REPLACE INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) VALUES ('demo-camp-2', 'Guida ai preventivi', 'preventivo', '17900000000000001', '["Ti scrivo in privato"]', 'Ciao, ecco la guida.', 'Mandami la guida', 'prova', 'Ecco la guida.', 0, ${m(10 * 1440)})`,
    `INSERT OR REPLACE INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, motivo, tentativi, creato_il, aggiornato_il) VALUES ('demo-comm-1', '17900000000000002', 'u1', 'giulia.bianchi', 'Workflow per favore!', 'demo-camp-1', 'link_inviato', NULL, 1, ${m(20)}, ${m(18)})`,
    `INSERT OR REPLACE INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, motivo, tentativi, creato_il, aggiornato_il) VALUES ('demo-comm-2', '17900000000000002', 'u2', 'marco.studio', 'workflow', 'demo-camp-1', 'inviato', NULL, 1, ${m(45)}, ${m(45)})`,
    `INSERT OR REPLACE INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, motivo, tentativi, creato_il, aggiornato_il) VALUES ('demo-comm-3', '17900000000000002', 'u3', 'paola.r', 'Bellissimo post', NULL, 'ignorato', 'nessuna parola delle campagne', 0, ${m(90)}, ${m(90)})`,
    `INSERT OR REPLACE INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, motivo, tentativi, creato_il, aggiornato_il) VALUES ('demo-comm-4', '17900000000000002', 'u4', 'luca.ferri', 'Mi interessa il workflow', 'demo-camp-1', 'errore', 'finestra dei 7 giorni chiusa o messaggi non consentiti', 3, ${m(180)}, ${m(170)})`,
    `INSERT OR REPLACE INTO risorse_richieste (id, slug, nome, azienda, telefono, messaggio, creata_il) VALUES ('demo-rich-1', 'prova', 'Mario Rossi', 'Rossi Srl', '333 123 4567', 'Meglio il pomeriggio', ${m(30)})`,
  ].join("; ");
  execFileSync("npx", ["wrangler", "d1", "execute", "acceleriamo-os-demo", "--env", "demo", "--local", "--command", risponditore], opz);
}
