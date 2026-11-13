CREATE TABLE `cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`trimestre_id` text NOT NULL,
	`debut` text NOT NULL,
	`fin` text NOT NULL,
	`cree_le` text NOT NULL,
	`cree_par` text NOT NULL,
	FOREIGN KEY (`trimestre_id`) REFERENCES `trimestres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cycles_trimestre` ON `cycles` (`trimestre_id`);--> statement-breakpoint
CREATE TABLE `objectifs` (
	`id` text PRIMARY KEY NOT NULL,
	`trimestre_id` text NOT NULL,
	`titre` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cree_le` text NOT NULL,
	`cree_par` text NOT NULL,
	FOREIGN KEY (`trimestre_id`) REFERENCES `trimestres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `objectifs_trimestre` ON `objectifs` (`trimestre_id`);--> statement-breakpoint
CREATE TABLE `trimestres` (
	`id` text PRIMARY KEY NOT NULL,
	`annee` integer NOT NULL,
	`numero` integer NOT NULL,
	`debut` text NOT NULL,
	`fin` text NOT NULL,
	`cree_le` text NOT NULL,
	`cree_par` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trimestres_annee_numero` ON `trimestres` (`annee`,`numero`);