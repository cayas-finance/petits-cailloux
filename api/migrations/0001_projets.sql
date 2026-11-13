CREATE TABLE `projet_objectifs` (
	`projet_id` text NOT NULL,
	`objectif_id` text NOT NULL,
	FOREIGN KEY (`projet_id`) REFERENCES `projets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`objectif_id`) REFERENCES `objectifs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projet_objectifs_pk` ON `projet_objectifs` (`projet_id`,`objectif_id`);--> statement-breakpoint
CREATE INDEX `projet_objectifs_objectif` ON `projet_objectifs` (`objectif_id`);--> statement-breakpoint
CREATE TABLE `projets` (
	`id` text PRIMARY KEY NOT NULL,
	`nom` text NOT NULL,
	`owner` text NOT NULL,
	`statut` text DEFAULT 'recu' NOT NULL,
	`cycle_id` text,
	`cree_le` text NOT NULL,
	`cree_par` text NOT NULL,
	`maj_le` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projets_cycle` ON `projets` (`cycle_id`);--> statement-breakpoint
CREATE INDEX `projets_statut` ON `projets` (`statut`);