CREATE TABLE `sanctions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`until` integer,
	`email_hash` text,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	`lifted_at` integer
);
--> statement-breakpoint
CREATE INDEX `sanctions_user` ON `sanctions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sanctions_email` ON `sanctions` (`email_hash`);--> statement-breakpoint
ALTER TABLE `reports` ADD `status` text DEFAULT 'ouvert' NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `handled_at` integer;--> statement-breakpoint
CREATE INDEX `reports_status` ON `reports` (`status`,`at`);