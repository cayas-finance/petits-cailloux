PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`format` text DEFAULT 'bet' NOT NULL,
	`owner` text,
	`requester` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`cycle_id` text,
	`pitch` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "name", "format", "owner", "requester", "status", "cycle_id", "pitch", "created_at", "created_by", "updated_at") SELECT "id", "name", 'bet', "owner", '', "status", "cycle_id", "pitch", "created_at", "created_by", "updated_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `projects_cycle` ON `projects` (`cycle_id`);--> statement-breakpoint
CREATE INDEX `projects_status` ON `projects` (`status`);