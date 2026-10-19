CREATE TABLE `ig_account` (
	`id` text PRIMARY KEY NOT NULL,
	`ig_user_id` text NOT NULL,
	`username` text NOT NULL,
	`token_cifrato` text NOT NULL,
	`scade_il` integer NOT NULL,
	`rinnovato_il` integer NOT NULL,
	`ultimo_errore` text
);
--> statement-breakpoint
CREATE TABLE `risorse` (
	`slug` text PRIMARY KEY NOT NULL,
	`titolo` text NOT NULL,
	`sottotitolo` text NOT NULL,
	`corpo` text NOT NULL,
	`pdf_url` text,
	`attiva` integer NOT NULL,
	`creata_il` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `risorse_richieste` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`nome` text NOT NULL,
	`azienda` text NOT NULL,
	`telefono` text NOT NULL,
	`messaggio` text,
	`creata_il` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `risp_campagne` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`parola` text NOT NULL,
	`media_id` text,
	`rispostepubbliche` text NOT NULL,
	`testo_privato` text NOT NULL,
	`etichetta_pulsante` text DEFAULT 'Mandami il link' NOT NULL,
	`risorsa_slug` text NOT NULL,
	`testo_link` text NOT NULL,
	`attiva` integer NOT NULL,
	`creata_il` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `risp_eventi` (
	`commento_id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`autore_id` text NOT NULL,
	`autore_nome` text,
	`testo` text NOT NULL,
	`campagna_id` text,
	`stato` text NOT NULL,
	`motivo` text,
	`tentativi` integer DEFAULT 0 NOT NULL,
	`risposta_pubblica_id` text,
	`creato_il` integer NOT NULL,
	`aggiornato_il` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_risp_eventi_campagna` ON `risp_eventi` (`campagna_id`,`autore_id`,`media_id`);--> statement-breakpoint
CREATE INDEX `idx_risp_eventi_stato` ON `risp_eventi` (`stato`,`aggiornato_il`);