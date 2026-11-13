CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`week` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `announcements_cycle_week` ON `announcements` (`cycle_id`,`week`);