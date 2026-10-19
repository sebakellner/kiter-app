CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	CONSTRAINT "author_name" CHECK(length(trim("authors"."name")) > 0),
	CONSTRAINT "author_key" CHECK(length("authors"."name_key") > 0)
) STRICT;
--> statement-breakpoint
CREATE INDEX `authors_by_name_key` ON `authors` (`name_key`,`id`);--> statement-breakpoint
CREATE TABLE `collection_samples` (
	`collection_id` text NOT NULL,
	`sample_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `sample_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collection_position_nonnegative" CHECK("collection_samples"."position" >= 0)
) STRICT;
--> statement-breakpoint
CREATE INDEX `collections_by_sample` ON `collection_samples` (`sample_id`,`collection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_position` ON `collection_samples` (`collection_id`,`position`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_asset_id` text,
	FOREIGN KEY (`cover_asset_id`) REFERENCES `image_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "collection_name" CHECK(length(trim("collections"."name")) > 0)
) STRICT;
--> statement-breakpoint
CREATE INDEX `collections_by_cover` ON `collections` (`cover_asset_id`);--> statement-breakpoint
CREATE TABLE `excluded_sources` (
	`canonical_path` text PRIMARY KEY NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE `genres` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	CONSTRAINT "genre_name" CHECK(length(trim("genres"."name")) > 0),
	CONSTRAINT "genre_key" CHECK(length("genres"."name_key") > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_name_key_unique` ON `genres` (`name_key`);--> statement-breakpoint
CREATE TABLE `image_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`state` text DEFAULT 'ready' NOT NULL,
	CONSTRAINT "image_mime" CHECK("image_assets"."mime_type" IN ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "image_size" CHECK("image_assets"."byte_size" BETWEEN 1 AND 10485760),
	CONSTRAINT "image_width" CHECK("image_assets"."width" BETWEEN 1 AND 4096),
	CONSTRAINT "image_height" CHECK("image_assets"."height" BETWEEN 1 AND 4096),
	CONSTRAINT "image_state" CHECK("image_assets"."state" IN ('ready', 'cleanup_pending')),
	CONSTRAINT "image_storage_key" CHECK(("image_assets"."mime_type" = 'image/png' AND "image_assets"."storage_key" = "image_assets"."id" || '.png')
        OR ("image_assets"."mime_type" = 'image/jpeg' AND "image_assets"."storage_key" = "image_assets"."id" || '.jpg')
        OR ("image_assets"."mime_type" = 'image/webp' AND "image_assets"."storage_key" = "image_assets"."id" || '.webp'))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `image_assets_storage_key_unique` ON `image_assets` (`storage_key`);--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	CONSTRAINT "instrument_name" CHECK(length(trim("instruments"."name")) > 0),
	CONSTRAINT "instrument_key" CHECK(length("instruments"."name_key") > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_name_key_unique` ON `instruments` (`name_key`);--> statement-breakpoint
CREATE TABLE `pack_authors` (
	`pack_id` text NOT NULL,
	`author_id` text NOT NULL,
	PRIMARY KEY(`pack_id`, `author_id`),
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `packs_by_author` ON `pack_authors` (`author_id`,`pack_id`);--> statement-breakpoint
CREATE TABLE `pack_genres` (
	`pack_id` text NOT NULL,
	`genre_id` text NOT NULL,
	PRIMARY KEY(`pack_id`, `genre_id`),
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `packs_by_genre` ON `pack_genres` (`genre_id`,`pack_id`);--> statement-breakpoint
CREATE TABLE `pack_instruments` (
	`pack_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	PRIMARY KEY(`pack_id`, `instrument_id`),
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `packs_by_instrument` ON `pack_instruments` (`instrument_id`,`pack_id`);--> statement-breakpoint
CREATE TABLE `packs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_root_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_asset_id` text,
	FOREIGN KEY (`source_root_id`) REFERENCES `source_roots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cover_asset_id`) REFERENCES `image_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pack_name" CHECK(length(trim("packs"."name")) > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `packs_source_root_id_unique` ON `packs` (`source_root_id`);--> statement-breakpoint
CREATE INDEX `packs_by_cover` ON `packs` (`cover_asset_id`);--> statement-breakpoint
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
	CONSTRAINT "alias_dimension" CHECK("recognition_aliases"."dimension" in ('instrument', 'genre', 'sample-type')),
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
	`instrument_id` text,
	`genre_id` text,
	`state` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "vocabulary_dimension" CHECK("recognition_vocabulary"."dimension" in ('instrument', 'genre', 'sample-type')),
	CONSTRAINT "vocabulary_state" CHECK("recognition_vocabulary"."state" in ('active', 'offered', 'deleted')),
	CONSTRAINT "vocabulary_target" CHECK(("recognition_vocabulary"."instrument_id" is null or "recognition_vocabulary"."dimension" = 'instrument') and ("recognition_vocabulary"."genre_id" is null or "recognition_vocabulary"."dimension" = 'genre')),
	CONSTRAINT "vocabulary_name" CHECK(length(trim("recognition_vocabulary"."name")) > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_vocabulary_instrument_id_unique` ON `recognition_vocabulary` (`instrument_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_vocabulary_genre_id_unique` ON `recognition_vocabulary` (`genre_id`);--> statement-breakpoint
CREATE TABLE `sample_authors` (
	`sample_id` text NOT NULL,
	`author_id` text NOT NULL,
	PRIMARY KEY(`sample_id`, `author_id`),
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `samples_by_author` ON `sample_authors` (`author_id`,`sample_id`);--> statement-breakpoint
CREATE TABLE `sample_genres` (
	`sample_id` text NOT NULL,
	`genre_id` text NOT NULL,
	PRIMARY KEY(`sample_id`, `genre_id`),
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `samples_by_genre` ON `sample_genres` (`genre_id`,`sample_id`);--> statement-breakpoint
CREATE TABLE `sample_instruments` (
	`sample_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	PRIMARY KEY(`sample_id`, `instrument_id`),
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE INDEX `samples_by_instrument` ON `sample_instruments` (`instrument_id`,`sample_id`);--> statement-breakpoint
CREATE TABLE `sample_sources` (
	`sample_id` text PRIMARY KEY NOT NULL,
	`canonical_path` text NOT NULL,
	`availability` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`observed_size_bytes` integer,
	`observed_mtime_ms` real,
	`last_checked_at` text NOT NULL,
	`last_error_code` text,
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "source_availability" CHECK("sample_sources"."availability" IN ('available', 'missing', 'inaccessible')),
	CONSTRAINT "source_revision" CHECK("sample_sources"."revision" >= 1),
	CONSTRAINT "source_size" CHECK("sample_sources"."observed_size_bytes" >= 0),
	CONSTRAINT "source_error" CHECK(("sample_sources"."availability" = 'available' AND "sample_sources"."last_error_code" IS NULL)
        OR ("sample_sources"."availability" IN ('missing', 'inaccessible')
        AND "sample_sources"."last_error_code" IS NOT NULL AND length("sample_sources"."last_error_code") > 0))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `sample_sources_canonical_path_unique` ON `sample_sources` (`canonical_path`);--> statement-breakpoint
CREATE TABLE `samples` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`notes` text,
	`sample_type` text,
	`favorite` integer DEFAULT false NOT NULL,
	`pack_id` text,
	`origin_assignment` text DEFAULT 'automatic' NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sample_name" CHECK("samples"."display_name" IS NULL OR length(trim("samples"."display_name")) > 0),
	CONSTRAINT "sample_favorite" CHECK("samples"."favorite" IN (0, 1)),
	CONSTRAINT "sample_type" CHECK("samples"."sample_type" IS NULL OR "samples"."sample_type" IN ('loop', 'one-shot')),
	CONSTRAINT "sample_origin" CHECK("samples"."origin_assignment" IN ('automatic', 'manual'))
) STRICT;
--> statement-breakpoint
CREATE INDEX `samples_by_pack` ON `samples` (`pack_id`,`id`);--> statement-breakpoint
CREATE INDEX `favorite_samples` ON `samples` (`id`) WHERE "samples"."favorite" = 1;--> statement-breakpoint
CREATE TABLE `source_root_samples` (
	`source_root_id` text NOT NULL,
	`sample_id` text NOT NULL,
	`present` integer NOT NULL,
	PRIMARY KEY(`source_root_id`, `sample_id`),
	FOREIGN KEY (`source_root_id`) REFERENCES `source_roots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "root_sample_present" CHECK("source_root_samples"."present" IN (0, 1))
) STRICT;
--> statement-breakpoint
CREATE INDEX `roots_by_sample` ON `source_root_samples` (`sample_id`,`source_root_id`);--> statement-breakpoint
CREATE TABLE `source_roots` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_path` text NOT NULL,
	`registered` integer DEFAULT true NOT NULL,
	`last_scan_at` text,
	`last_scan_outcome` text,
	`last_scan_error_code` text,
	CONSTRAINT "root_registered" CHECK("source_roots"."registered" IN (0, 1)),
	CONSTRAINT "root_outcome" CHECK("source_roots"."last_scan_outcome" IN ('completed', 'failed')),
	CONSTRAINT "root_observation" CHECK(("source_roots"."last_scan_at" IS NULL) = ("source_roots"."last_scan_outcome" IS NULL)),
	CONSTRAINT "root_error" CHECK(("source_roots"."last_scan_outcome" IS NOT NULL AND "source_roots"."last_scan_outcome" = 'failed'
        AND "source_roots"."last_scan_error_code" IS NOT NULL AND length("source_roots"."last_scan_error_code") > 0)
        OR ("source_roots"."last_scan_error_code" IS NULL
        AND ("source_roots"."last_scan_outcome" IS NULL OR "source_roots"."last_scan_outcome" = 'completed')))
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `source_roots_canonical_path_unique` ON `source_roots` (`canonical_path`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`preview_volume` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preview_volume_range" CHECK("user_preferences"."preview_volume" BETWEEN 0 AND 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`singleton` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`avatar_asset_id` text,
	`author_id` text,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `image_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "profile_singleton" CHECK("user_profiles"."singleton" = 1),
	CONSTRAINT "profile_name" CHECK(length(trim("user_profiles"."name")) > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_singleton_unique` ON `user_profiles` (`singleton`);
