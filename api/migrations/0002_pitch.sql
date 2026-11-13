CREATE TABLE `fichiers` (
	`id` text PRIMARY KEY NOT NULL,
	`projet_id` text NOT NULL,
	`nom` text NOT NULL,
	`type` text NOT NULL,
	`taille` integer NOT NULL,
	`cree_le` text NOT NULL,
	`cree_par` text NOT NULL,
	FOREIGN KEY (`projet_id`) REFERENCES `projets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fichiers_projet` ON `fichiers` (`projet_id`);--> statement-breakpoint
ALTER TABLE `projets` ADD `pitch` text DEFAULT '' NOT NULL;