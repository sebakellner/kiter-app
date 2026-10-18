CREATE TABLE `genres` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	CONSTRAINT "genre_name" CHECK(length(trim("genres"."name")) > 0),
	CONSTRAINT "genre_key" CHECK(length("genres"."name_key") > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_name_key_unique` ON `genres` (`name_key`);--> statement-breakpoint
CREATE TABLE `pack_genres` (
	`pack_id` text NOT NULL,
	`genre_id` text NOT NULL,
	PRIMARY KEY(`pack_id`, `genre_id`),
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `packs_by_genre` ON `pack_genres` (`genre_id`,`pack_id`);--> statement-breakpoint
CREATE TABLE `recognition_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`target_key` text NOT NULL,
	`term` text NOT NULL,
	`term_key` text NOT NULL,
	`supplied_key` text,
	`dimension` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`target_key`) REFERENCES `recognition_vocabulary`(`key`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "alias_term" CHECK(length(trim("recognition_aliases"."term")) > 0 and length("recognition_aliases"."term_key") > 0),
	CONSTRAINT "alias_dimension" CHECK("recognition_aliases"."dimension" in ('category', 'genre', 'sample-type')),
	CONSTRAINT "alias_deleted" CHECK("recognition_aliases"."deleted" in (0, 1))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_aliases_supplied_key_unique` ON `recognition_aliases` (`supplied_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `aliases_by_dimension_term` ON `recognition_aliases` (`dimension`,`term_key`) WHERE "recognition_aliases"."deleted" = 0;--> statement-breakpoint
CREATE INDEX `aliases_by_target` ON `recognition_aliases` (`target_key`,`id`);--> statement-breakpoint
CREATE TABLE `recognition_vocabulary` (
	`key` text PRIMARY KEY NOT NULL,
	`dimension` text NOT NULL,
	`name` text NOT NULL,
	`category_id` text,
	`genre_id` text,
	`state` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "vocabulary_dimension" CHECK("recognition_vocabulary"."dimension" in ('category', 'genre', 'sample-type')),
	CONSTRAINT "vocabulary_state" CHECK("recognition_vocabulary"."state" in ('active', 'offered', 'deleted')),
	CONSTRAINT "vocabulary_target" CHECK(("recognition_vocabulary"."category_id" is null or "recognition_vocabulary"."dimension" = 'category') and ("recognition_vocabulary"."genre_id" is null or "recognition_vocabulary"."dimension" = 'genre')),
	CONSTRAINT "vocabulary_name" CHECK(length(trim("recognition_vocabulary"."name")) > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_vocabulary_category_id_unique` ON `recognition_vocabulary` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_vocabulary_genre_id_unique` ON `recognition_vocabulary` (`genre_id`);--> statement-breakpoint
CREATE TABLE `sample_genres` (
	`sample_id` text NOT NULL,
	`genre_id` text NOT NULL,
	PRIMARY KEY(`sample_id`, `genre_id`),
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `samples_by_genre` ON `sample_genres` (`genre_id`,`sample_id`);
