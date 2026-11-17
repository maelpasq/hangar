CREATE TABLE `bugs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`version` text NOT NULL,
	`os` text NOT NULL,
	`status` text DEFAULT 'nouveau' NOT NULL,
	`note` text,
	`fixed_in` text,
	`duplicate_of` integer,
	`capture` text,
	`discord_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE INDEX `bugs_status` ON `bugs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `bugs_closed` ON `bugs` (`closed_at`);