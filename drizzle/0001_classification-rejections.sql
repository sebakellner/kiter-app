CREATE TABLE `classification_rejections` (
	`contract_version` integer NOT NULL,
	`subject_key` text NOT NULL,
	`dimension` text NOT NULL,
	`target_key` text NOT NULL,
	`record` text NOT NULL,
	PRIMARY KEY(`subject_key`, `dimension`, `target_key`)
) STRICT;
--> statement-breakpoint
CREATE INDEX `rejections_by_subject` ON `classification_rejections` (`subject_key`);