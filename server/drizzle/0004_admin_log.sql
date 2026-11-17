CREATE TABLE `admin_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `admin_log_at` ON `admin_log` (`at`);--> statement-breakpoint
CREATE INDEX `admin_log_target` ON `admin_log` (`target_id`,`at`);