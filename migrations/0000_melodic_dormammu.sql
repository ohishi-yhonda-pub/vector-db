CREATE TABLE IF NOT EXISTS `vectors` (
	`id` text PRIMARY KEY NOT NULL,
	`dimensions` integer NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
