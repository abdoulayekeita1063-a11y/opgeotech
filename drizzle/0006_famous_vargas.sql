CREATE TABLE `monitoring_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`site` varchar(255),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monitoring_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `radar_monitoring_rows` MODIFY COLUMN `monitoringRecordId` int;--> statement-breakpoint
ALTER TABLE `radar_monitoring_rows` ADD `projectId` int;