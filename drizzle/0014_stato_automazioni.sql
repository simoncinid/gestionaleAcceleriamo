CREATE TABLE `stato_giri` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`voce_id` text NOT NULL,
	`esito` text NOT NULL,
	`at` integer NOT NULL,
	`messaggio` text,
	`passo` text
);
--> statement-breakpoint
CREATE INDEX `idx_stato_giri_voce` ON `stato_giri` (`voce_id`,`at`);--> statement-breakpoint
CREATE TABLE `stato_voci` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text DEFAULT 'interno' NOT NULL,
	`nome` text,
	`client_id` text,
	`automation_id` text,
	`intervallo_min` integer,
	`chiave_impronta` text,
	`attiva` integer DEFAULT true NOT NULL,
	`ultimo_esito` text,
	`ultimo_giro_at` integer,
	`ultimo_ok_at` integer,
	`ultimo_errore_at` integer,
	`ultimo_errore` text,
	`ultimo_passo` text,
	`creata_il` integer,
	`eliminata_il` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stato_voci_chiave_impronta_unique` ON `stato_voci` (`chiave_impronta`);--> statement-breakpoint
-- Ogni riga dello storico aggiorna la sua voce (una query sola per giro). Un giro saltato non cambia l'ultimo esito
-- né l'ultimo giro: se un lavoro salta a lungo la voce diventa gialla da sola.
CREATE TRIGGER `stato_giri_aggiorna_voce` AFTER INSERT ON `stato_giri` BEGIN
	INSERT INTO `stato_voci` (`id`, `tipo`, `attiva`, `ultimo_esito`, `ultimo_giro_at`, `ultimo_ok_at`, `ultimo_errore_at`, `ultimo_errore`, `ultimo_passo`)
	VALUES (NEW.voce_id, 'interno', 1, NEW.esito,
		CASE WHEN NEW.esito = 'saltato' THEN NULL ELSE NEW.at END,
		CASE WHEN NEW.esito = 'ok' THEN NEW.at END,
		CASE WHEN NEW.esito = 'errore' THEN NEW.at END,
		CASE WHEN NEW.esito = 'errore' THEN NEW.messaggio END,
		CASE WHEN NEW.esito = 'errore' THEN NEW.passo END)
	ON CONFLICT (`id`) DO UPDATE SET
		ultimo_esito = CASE WHEN excluded.ultimo_esito = 'saltato' THEN stato_voci.ultimo_esito ELSE excluded.ultimo_esito END,
		ultimo_giro_at = coalesce(excluded.ultimo_giro_at, stato_voci.ultimo_giro_at),
		ultimo_ok_at = coalesce(excluded.ultimo_ok_at, stato_voci.ultimo_ok_at),
		ultimo_errore_at = coalesce(excluded.ultimo_errore_at, stato_voci.ultimo_errore_at),
		ultimo_errore = CASE WHEN excluded.ultimo_errore_at IS NULL THEN stato_voci.ultimo_errore ELSE excluded.ultimo_errore END,
		ultimo_passo = CASE WHEN excluded.ultimo_errore_at IS NULL THEN stato_voci.ultimo_passo ELSE excluded.ultimo_passo END;
END;
--> statement-breakpoint
-- La riga del giro intero (voce "giro") tiene aggiornata anche la riga "giro" di Impostazioni > Integrazioni:
-- così il giro scrive il suo stato e quello dei lavori con una query sola. passo = codice dell'errore.
CREATE TRIGGER `stato_giri_aggiorna_integrazione` AFTER INSERT ON `stato_giri` WHEN NEW.voce_id = 'giro' BEGIN
	INSERT INTO `integration_status` (`key`, `ok`, `last_ok_at`, `last_error_at`, `last_error`, `error_id`)
	VALUES ('giro', NEW.esito <> 'errore',
		CASE WHEN NEW.esito <> 'errore' THEN NEW.at END,
		CASE WHEN NEW.esito = 'errore' THEN NEW.at END,
		CASE WHEN NEW.esito = 'errore' THEN NEW.messaggio END,
		CASE WHEN NEW.esito = 'errore' THEN NEW.passo END)
	ON CONFLICT (`key`) DO UPDATE SET
		ok = excluded.ok,
		last_ok_at = coalesce(excluded.last_ok_at, integration_status.last_ok_at),
		last_error_at = coalesce(excluded.last_error_at, integration_status.last_error_at),
		last_error = CASE WHEN excluded.ok THEN integration_status.last_error ELSE excluded.last_error END,
		error_id = CASE WHEN excluded.ok THEN integration_status.error_id ELSE excluded.error_id END;
END;
