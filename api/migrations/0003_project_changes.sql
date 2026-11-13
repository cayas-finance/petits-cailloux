CREATE TABLE `project_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`cycle_id` text,
	`week` integer,
	`from_status` text,
	`to_status` text NOT NULL,
	`from_format` text,
	`to_format` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_changes_cycle_week` ON `project_changes` (`cycle_id`,`week`);--> statement-breakpoint
CREATE INDEX `project_changes_project` ON `project_changes` (`project_id`);