ALTER TABLE `samples` ADD `sample_type` text CONSTRAINT "sample_type" CHECK("sample_type" IS NULL OR "sample_type" IN ('loop', 'one-shot'));
