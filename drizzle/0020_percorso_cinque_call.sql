ALTER TABLE `proposals` ADD `forbice_da_cents` integer;--> statement-breakpoint
ALTER TABLE `proposals` ADD `forbice_a_cents` integer;--> statement-breakpoint
-- 28/10/2026, blocco 1, modifica 25: percorso di vendita a cinque chiamate (decisioni di Tommaso).
-- Gli id delle fasi esistenti restano; cambiano etichetta, ordine e colore. Tre fasi nuove: 45, 50, 55.
-- Colori: arancione le fasi da fare, blu quelle con una call fissata, ocra (yellow) la decisione, grigio 80 e 90.
UPDATE stages SET label = 'Nuovo, da chiamare', sort_order = 10, tone = 'orange' WHERE id = 'da-chiamare-prima-volta';
--> statement-breakpoint
UPDATE stages SET label = 'Da richiamare', sort_order = 20, tone = 'orange' WHERE id = 'da-richiamare';
--> statement-breakpoint
UPDATE stages SET label = 'Conoscenza fissata', sort_order = 30, tone = 'blue', suggested_next_action = 'Call di conoscenza' WHERE id = 'appuntamento-confermato';
--> statement-breakpoint
UPDATE stages SET label = 'In attesa offerta', sort_order = 35, tone = 'orange', suggested_next_action = 'Preparare l''offerta', suggested_delay_hours = NULL WHERE id = 'in-attesa-preventivo';
--> statement-breakpoint
UPDATE stages SET label = 'Offerta fissata', sort_order = 40, tone = 'blue', suggested_next_action = 'Call dell''offerta' WHERE id = 'presentazione-confermata';
--> statement-breakpoint
INSERT INTO stages (id, label, sort_order, kind, tone, probability, suggested_next_action, suggested_delay_hours, requires_reason) VALUES
  ('analisi-fissata', 'Analisi fissata', 45, 'open', 'blue', 60, 'Call di analisi', NULL, 0),
  ('in-attesa-progetto', 'In attesa progetto', 50, 'open', 'orange', 65, 'Preparare il progetto', NULL, 0),
  ('progetto-fissato', 'Progetto fissato', 55, 'open', 'blue', 70, 'Call del progetto', NULL, 0);
--> statement-breakpoint
UPDATE stages SET label = 'In attesa decisione', sort_order = 60, tone = 'yellow' WHERE id = 'in-attesa-decisione';
--> statement-breakpoint
UPDATE stages SET label = 'Cliente', sort_order = 70, tone = 'green' WHERE id = 'chiuso';
--> statement-breakpoint
UPDATE stages SET label = 'Non interessato', sort_order = 80, tone = 'neutral' WHERE id = 'non-chiuso';
--> statement-breakpoint
UPDATE stages SET label = 'Non profilato', sort_order = 90, tone = 'neutral' WHERE id = 'fake';
--> statement-breakpoint
-- La call di presentazione ora è la call dell'offerta: i lead in "Presentazione fissata" sono in "Offerta fissata" (stesso id).
UPDATE calls SET kind = 'offerta' WHERE kind = 'presentazione';
--> statement-breakpoint
-- Codici esito salvati nello storico: nomi nuovi.
UPDATE activities SET outcome = CASE outcome
  WHEN 'appuntamento' THEN 'conoscenza_fissata'
  WHEN 'consulenza_fatta' THEN 'conoscenza_fatta'
  WHEN 'presentazione_fissata' THEN 'offerta_fissata'
  WHEN 'presentazione_fatta' THEN 'offerta_presentata'
END
WHERE outcome IN ('appuntamento', 'consulenza_fatta', 'presentazione_fissata', 'presentazione_fatta');
--> statement-breakpoint
-- Prossime azioni salvate con le parole vecchie.
UPDATE leads SET next_action = CASE next_action
  WHEN 'Call di presentazione' THEN 'Call dell''offerta'
  WHEN 'Preparare il preventivo' THEN 'Preparare l''offerta'
  WHEN 'Fissare la call di presentazione' THEN 'Fissare la call dell''offerta'
END
WHERE next_action IN ('Call di presentazione', 'Preparare il preventivo', 'Fissare la call di presentazione');
