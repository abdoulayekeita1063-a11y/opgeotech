CREATE TABLE `radar_monitoring_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`monitoringRecordId` int NOT NULL,
	`measuredAt` double NOT NULL,
	`pit` varchar(128) NOT NULL,
	`window` varchar(128) NOT NULL,
	`displacementMaxMm` double,
	`displacementMinMm` double,
	`displacementAverageMm` double,
	`velocityMaxMmPerDay` double,
	`velocityMinMmPerDay` double,
	`velocityAverageMmPerDay` double,
	`observations` text,
	`source` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `radar_monitoring_rows_id` PRIMARY KEY(`id`)
);
