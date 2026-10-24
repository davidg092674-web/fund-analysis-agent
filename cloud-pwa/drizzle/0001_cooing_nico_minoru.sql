CREATE TABLE `evaluations` (
	`snapshot_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`published_at` text NOT NULL,
	`first_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_cache` (
	`symbol` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`business_date` text NOT NULL,
	`body` text NOT NULL,
	`captured_at` text NOT NULL
);
