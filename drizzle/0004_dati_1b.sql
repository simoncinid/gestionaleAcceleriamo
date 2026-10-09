-- Dati del Piano A: valori di partenza per fasi, regole, modelli, foglio e porting dei dati della 1A.
UPDATE stages SET probability = 10, suggested_next_action = 'Prima chiamata', suggested_delay_hours = 0 WHERE id = 'da-chiamare-prima-volta';
--> statement-breakpoint
UPDATE stages SET probability = 10, suggested_next_action = 'Richiamare', suggested_delay_hours = 24 WHERE id = 'non-chiamato';
--> statement-breakpoint
UPDATE stages SET probability = 15, suggested_next_action = 'Richiamare', suggested_delay_hours = 24 WHERE id = 'da-richiamare';
--> statement-breakpoint
UPDATE stages SET probability = 30, suggested_next_action = 'Call di conoscenza' WHERE id = 'appuntamento-confermato';
--> statement-breakpoint
UPDATE stages SET probability = 45, suggested_next_action = 'Call di presentazione' WHERE id = 'presentazione-confermata';
--> statement-breakpoint
UPDATE stages SET probability = 55, suggested_next_action = 'Preparare il preventivo', suggested_delay_hours = 48 WHERE id = 'in-attesa-preventivo';
--> statement-breakpoint
UPDATE stages SET probability = 80, suggested_next_action = 'Follow-up preventivo', suggested_delay_hours = 72 WHERE id = 'in-attesa-decisione';
--> statement-breakpoint
UPDATE stages SET probability = 20, suggested_next_action = 'Richiamare dopo la pausa', suggested_delay_hours = 1440 WHERE id = 'probabilmente-bloccato';
--> statement-breakpoint
UPDATE stages SET probability = 100 WHERE id = 'chiuso';
--> statement-breakpoint
UPDATE stages SET requires_reason = 1 WHERE id IN ('non-chiuso', 'fuori-target', 'fake');
--> statement-breakpoint
INSERT INTO stage_rules (id, rule_key, stage_id, event, params, active) VALUES
  ('sla-prima', 'sla', 'da-chiamare-prima-volta', NULL, '{"minuti":120,"avvisoMinuti":90}', 1),
  ('tentativi-non-chiamato', 'tentativi', 'non-chiamato', NULL, '{"massimo":5}', 1),
  ('tentativi-da-richiamare', 'tentativi', 'da-richiamare', NULL, '{"massimo":5}', 1),
  ('preventivo-48h', 'preventivo_48h', NULL, 'call_conoscenza_fatta', '{"ore":48}', 1),
  ('ricontatti-decisione', 'ricontatti', 'in-attesa-decisione', NULL, '{"giorni":[3,7,14]}', 1),
  ('pausa-bloccato', 'pausa', 'probabilmente-bloccato', NULL, '{"mesi":2}', 1),
  ('fermo-aperte', 'fermo', NULL, NULL, '{"giorni":7}', 1);
--> statement-breakpoint
INSERT INTO message_templates (id, channel, key, title, subject, body, stage_id, sort_order) VALUES
  ('mod-primo-contatto', 'whatsapp', 'primo_contatto', 'Primo contatto', NULL, 'Ciao {referente}, sono Tommaso di Acceleriamo. Hai lasciato una richiesta per {azienda}: quando ti posso chiamare per cinque minuti?', 'da-chiamare-prima-volta', 10),
  ('mod-non-trovato', 'whatsapp', 'non_ti_ho_trovato', 'Non ti ho trovato', NULL, 'Ciao {referente}, ti ho cercato poco fa per la richiesta che hai lasciato. Ti richiamo domani mattina, oppure scrivimi qui l''orario che preferisci.', 'non-chiamato', 20),
  ('mod-ti-ho-cercato', 'email', 'ti_ho_cercato', 'Ti ho cercato', 'Ti ho cercato', 'Ciao {referente}, ti ho chiamato un paio di volte per la richiesta di {azienda} senza trovarti. Rispondi a questa email con un orario comodo e ti richiamo io. Tommaso, Acceleriamo', 'da-richiamare', 30),
  ('mod-conferma-conoscenza', 'whatsapp', 'conferma_conoscenza', 'Conferma call di conoscenza', NULL, 'Ciao {referente}, confermo la nostra call di {data} alle {ora}. Il link è questo: {link_meet}', 'appuntamento-confermato', 40),
  ('mod-conferma-presentazione', 'whatsapp', 'conferma_presentazione', 'Conferma call di presentazione', NULL, 'Ciao {referente}, confermo la presentazione della proposta per {azienda}, {data} alle {ora}. Il link è questo: {link_meet}', 'presentazione-confermata', 50),
  ('mod-promemoria', 'whatsapp', 'promemoria', 'Promemoria un''ora prima', NULL, 'Ciao {referente}, ci sentiamo tra un''ora. Il link è questo: {link_meet}', NULL, 60),
  ('mod-follow-up', 'email', 'follow_up_preventivo', 'Follow-up preventivo', 'La proposta per {azienda}', 'Ciao {referente}, ti scrivo per sapere se hai avuto modo di guardare la proposta. Se hai dubbi ne parliamo in dieci minuti al telefono. Tommaso, Acceleriamo', 'in-attesa-decisione', 70),
  ('mod-conferma', 'email', 'conferma', 'Conferma lead nuovo', 'Abbiamo ricevuto la tua richiesta', 'Ciao {referente}, grazie per averci scritto. Ti chiamiamo entro un giorno lavorativo dal numero che ci hai lasciato. Se preferisci un orario, rispondi a questa email.

Tommaso, Acceleriamo', NULL, 80);
--> statement-breakpoint
INSERT INTO sheet_sync_state (id, last_row) VALUES ('foglio-andrea', 1);
--> statement-breakpoint
INSERT INTO calls (id, lead_id, kind, scheduled_at, meet_link, created_by, created_at, updated_at)
SELECT lower(hex(randomblob(16))), l.id,
  CASE WHEN (SELECT sort_order FROM stages WHERE id = l.stage_id) >= (SELECT sort_order FROM stages WHERE id = 'presentazione-confermata') THEN 'presentazione' ELSE 'conoscenza' END,
  l.appointment_at, l.meet_link, 'migrazione', l.updated_at, l.updated_at
FROM leads l WHERE l.appointment_at IS NOT NULL AND l.deleted_at IS NULL;
--> statement-breakpoint
INSERT INTO proposals (id, lead_id, number, company, option, status, pdf_url, registered_via, version, created_at, updated_at)
SELECT lower(hex(randomblob(16))), l.id, '1A-' || l.id, l.company, 'standard', 'registrata', l.proposal_url, 'migrazione', 1, l.updated_at, l.updated_at
FROM leads l WHERE l.proposal_url IS NOT NULL AND l.deleted_at IS NULL;
