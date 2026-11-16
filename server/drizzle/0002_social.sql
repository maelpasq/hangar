CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_user` ON `activity` (`user_id`,`at`);--> statement-breakpoint
CREATE TABLE `friends` (
	`user_id` text NOT NULL,
	`other_id` text NOT NULL,
	`state` text NOT NULL,
	`since` integer NOT NULL,
	PRIMARY KEY(`user_id`, `other_id`)
);
--> statement-breakpoint
CREATE INDEX `friends_other` ON `friends` (`other_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`convo` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`nonce` text NOT NULL,
	`at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `messages_convo` ON `messages` (`convo`,`at`);--> statement-breakpoint
CREATE INDEX `messages_unread` ON `messages` (`to_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_id` text NOT NULL,
	`message_id` text,
	`excerpt` text,
	`reason` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_target` ON `reports` (`target_id`);--> statement-breakpoint
CREATE TABLE `social` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`code` text NOT NULL,
	`findable` integer DEFAULT true NOT NULL,
	`status_vis` text DEFAULT 'friends' NOT NULL,
	`game_vis` text DEFAULT 'friends' NOT NULL,
	`play_vis` text DEFAULT 'friends' NOT NULL,
	`library_vis` text DEFAULT 'friends' NOT NULL,
	`banner` text,
	`showcase` text,
	`games` text,
	`online` integer DEFAULT false NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`playing` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_code_unique` ON `social` (`code`);--> statement-breakpoint
CREATE INDEX `social_enabled` ON `social` (`enabled`,`findable`);