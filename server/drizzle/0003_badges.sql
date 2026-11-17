CREATE TABLE `badges` (
	`user_id` text NOT NULL,
	`badge` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `badge`)
);
