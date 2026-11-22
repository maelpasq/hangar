CREATE TABLE `presence_icons` (
	`hash` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `presence_icons_used` ON `presence_icons` (`used_at`);