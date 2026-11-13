CREATE TABLE `notes_suivi` (
	`id` text PRIMARY KEY NOT NULL,
	`projet_id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`semaine` integer NOT NULL,
	`texte` text NOT NULL,
	`cree_le` text NOT NULL,
	`cree_par` text NOT NULL,
	`maj_le` text NOT NULL,
	`maj_par` text NOT NULL,
	FOREIGN KEY (`projet_id`) REFERENCES `projets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_suivi_semaine` ON `notes_suivi` (`projet_id`,`cycle_id`,`semaine`);--> statement-breakpoint
CREATE INDEX `notes_suivi_cycle` ON `notes_suivi` (`cycle_id`);