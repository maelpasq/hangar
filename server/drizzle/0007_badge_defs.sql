CREATE TABLE `badge_defs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `badge_defs` (`id`, `name`, `description`, `icon`, `color`, `position`, `active`, `created_at`) VALUES
	('certifie', 'Compte certifié', 'Compte vérifié par Hangar', 'seal', 'accent', 1, 1, 0),
	('equipe', 'Équipe Hangar', 'Membre de pamal Studio', 'shield', '#8d70ff', 2, 1, 0),
	('testeur', 'Testeur de Hangar', 'Teste les versions de Hangar Test', 'flask', '#22b8a6', 3, 1, 0),
	('chasseur', 'Chasseur de bugs', 'A signalé un bug corrigé', 'bug', '#3fb950', 4, 1, 0);
