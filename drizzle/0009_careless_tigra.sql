ALTER TABLE `monitoring_records` MODIFY COLUMN `riskLevel` enum('Low','Moderate','High','Critical') NOT NULL DEFAULT 'Low';--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `pitPhase` varchar(128);--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `area` varchar(128);--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `operation` varchar(128);--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `inspectorName` varchar(255);--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `startBench` varchar(64);--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `endBench` varchar(64);--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `inspectionDate` varchar(32);--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `riskScore` double;--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `actionPriority` text;--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `categoryScoresJson` longtext;--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `recommendations` text;--> statement-breakpoint
ALTER TABLE `monitoring_records` ADD `inspectionDataJson` longtext;