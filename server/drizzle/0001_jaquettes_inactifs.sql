CREATE TABLE `covers` (
	`user_id` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `hash`)
);
--> statement-breakpoint
ALTER TABLE `profiles` ADD `warned_at` integer;