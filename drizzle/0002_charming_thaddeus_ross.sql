ALTER TABLE `sample_sources` ADD `search_filename` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `samples` ADD `search_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_root_samples` ADD `search_relative_path` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `sample_sources` SET
  `search_filename` = kiter_search_text(kiter_filename(`canonical_path`));
--> statement-breakpoint
UPDATE `samples` SET `search_name` = kiter_search_text(coalesce(
  `display_name`,
  (SELECT kiter_filename(`ss`.`canonical_path`) FROM `sample_sources` `ss`
    WHERE `ss`.`sample_id` = `samples`.`id`)
));
--> statement-breakpoint
UPDATE `source_root_samples` SET `search_relative_path` = kiter_search_text(
  kiter_relative_path(
    (SELECT `ss`.`canonical_path` FROM `sample_sources` `ss`
      WHERE `ss`.`sample_id` = `source_root_samples`.`sample_id`),
    (SELECT `r`.`canonical_path` FROM `source_roots` `r`
      WHERE `r`.`id` = `source_root_samples`.`source_root_id`)
  )
);
