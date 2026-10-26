-- 26/10/2026: fasi del lead ridotte e in ordine col processo di vendita (riunione Tommaso e Diego).
-- Gli id restano quelli di prima (codice, storico e test li usano): cambiano nome, ordine e colore.
-- Mappa vecchia -> nuova:
--   da-chiamare-prima-volta  "Da chiamare prima volta"   -> "Nuovo, da chiamare"
--   non-chiamato             "Non chiamato"              -> da-richiamare "Da richiamare" (fase tolta)
--   da-richiamare            "Da richiamare"             -> "Da richiamare"
--   appuntamento-confermato  "Appuntamento confermato"   -> "Consulenza fissata" (solo la prima call)
--   in-attesa-preventivo     "In attesa preventivo"      -> "In attesa preventivo" (ora prima della presentazione)
--   presentazione-confermata "Presentazione confermata"  -> "Presentazione fissata" (seconda call)
--   in-attesa-decisione      "In attesa decisione"       -> "In attesa decisione"
--   probabilmente-bloccato   "Probabilmente bloccato"    -> in-attesa-decisione (fase tolta: la pausa resta in paused_until)
--   chiuso                   "Chiuso"                    -> "Cliente" (contratto firmato, verde)
--   non-chiuso               "Non chiuso"                -> "Non interessato"
--   fuori-target             "Fuori target"              -> fake "Non profilato" (fase tolta)
--   fake                     "Fake"                      -> "Non profilato" (contatti falsi o inutilizzabili)
INSERT INTO activities (id, lead_id, type, body, author_id, created_at)
SELECT lower(hex(randomblob(16))), l.id, 'cambio_fase',
  'Da "' || s.label || '" a "' || CASE l.stage_id WHEN 'non-chiamato' THEN 'Da richiamare' WHEN 'probabilmente-bloccato' THEN 'In attesa decisione' ELSE 'Non profilato' END || '" (fasi riordinate il 26/10/2026)',
  NULL, CAST(unixepoch('subsec') * 1000 AS INTEGER)
FROM leads l JOIN stages s ON s.id = l.stage_id
WHERE l.stage_id IN ('non-chiamato', 'probabilmente-bloccato', 'fuori-target');
--> statement-breakpoint
UPDATE leads SET stage_id = 'da-richiamare' WHERE stage_id = 'non-chiamato';
--> statement-breakpoint
UPDATE leads SET stage_id = 'in-attesa-decisione' WHERE stage_id = 'probabilmente-bloccato';
--> statement-breakpoint
UPDATE leads SET stage_id = 'fake', lost_reason = COALESCE(lost_reason, 'fuori_target') WHERE stage_id = 'fuori-target';
--> statement-breakpoint
DELETE FROM stage_rules WHERE id = 'tentativi-non-chiamato';
--> statement-breakpoint
UPDATE stage_rules SET stage_id = 'in-attesa-decisione' WHERE stage_id = 'probabilmente-bloccato';
--> statement-breakpoint
UPDATE stage_rules SET stage_id = NULL WHERE stage_id IN ('non-chiamato', 'fuori-target');
--> statement-breakpoint
-- Dopo la consulenza il preventivo si prepara il giorno dopo (alle 10, vedi worker/regole/motore.ts).
UPDATE stage_rules SET params = '{"ore":24}' WHERE id = 'preventivo-48h' AND params = '{"ore":48}';
--> statement-breakpoint
UPDATE message_templates SET stage_id = 'da-richiamare' WHERE stage_id = 'non-chiamato';
--> statement-breakpoint
UPDATE message_templates SET stage_id = 'in-attesa-decisione' WHERE stage_id = 'probabilmente-bloccato';
--> statement-breakpoint
UPDATE message_templates SET stage_id = NULL WHERE stage_id = 'fuori-target';
--> statement-breakpoint
DELETE FROM stages WHERE id IN ('non-chiamato', 'probabilmente-bloccato', 'fuori-target');
--> statement-breakpoint
UPDATE stages SET label = 'Nuovo, da chiamare', sort_order = 10, tone = 'orange' WHERE id = 'da-chiamare-prima-volta';
--> statement-breakpoint
UPDATE stages SET label = 'Da richiamare', sort_order = 20, tone = 'yellow' WHERE id = 'da-richiamare';
--> statement-breakpoint
UPDATE stages SET label = 'Consulenza fissata', sort_order = 30, tone = 'blue', probability = 30, suggested_next_action = 'Call di conoscenza' WHERE id = 'appuntamento-confermato';
--> statement-breakpoint
UPDATE stages SET label = 'In attesa preventivo', sort_order = 40, tone = 'orange', probability = 45, suggested_next_action = 'Preparare il preventivo', suggested_delay_hours = 24 WHERE id = 'in-attesa-preventivo';
--> statement-breakpoint
UPDATE stages SET label = 'Presentazione fissata', sort_order = 50, tone = 'blue', probability = 55, suggested_next_action = 'Call di presentazione' WHERE id = 'presentazione-confermata';
--> statement-breakpoint
UPDATE stages SET label = 'In attesa decisione', sort_order = 60, tone = 'yellow' WHERE id = 'in-attesa-decisione';
--> statement-breakpoint
UPDATE stages SET label = 'Cliente', sort_order = 70, tone = 'green' WHERE id = 'chiuso';
--> statement-breakpoint
UPDATE stages SET label = 'Non interessato', sort_order = 80, tone = 'red' WHERE id = 'non-chiuso';
--> statement-breakpoint
UPDATE stages SET label = 'Non profilato', sort_order = 90, tone = 'neutral' WHERE id = 'fake';
--> statement-breakpoint
-- Nessun viola rimasto da modifiche fatte in Impostazioni.
UPDATE stages SET tone = 'neutral' WHERE tone = 'violet';
--> statement-breakpoint
-- Assegnazione: la prima telefonata la fa Diego (processo di vendita, dal 19/10/2026).
-- Le Impostazioni salvano l'id dell'utente: se la riga c'è già, prende l'id di Diego.
UPDATE settings SET value = json_set(value, '$.primaChiamata', (SELECT id FROM users WHERE username LIKE 'diego%' AND active = 1 ORDER BY username LIMIT 1))
WHERE key = 'assegnazione' AND EXISTS (SELECT 1 FROM users WHERE username LIKE 'diego%' AND active = 1);
--> statement-breakpoint
-- I lead ancora da chiamare senza responsabile vanno a Diego.
UPDATE leads SET owner_id = (SELECT id FROM users WHERE username LIKE 'diego%' AND active = 1 ORDER BY username LIMIT 1)
WHERE owner_id IS NULL AND deleted_at IS NULL AND stage_id IN ('da-chiamare-prima-volta', 'da-richiamare')
  AND EXISTS (SELECT 1 FROM users WHERE username LIKE 'diego%' AND active = 1);
