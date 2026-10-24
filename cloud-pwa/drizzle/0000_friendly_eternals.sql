CREATE TABLE `funds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nav_cache` (
	`code` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`generated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`nav_date` text NOT NULL,
	`body` text NOT NULL,
	`generated_at` text NOT NULL
);
