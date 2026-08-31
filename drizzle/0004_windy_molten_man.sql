CREATE TABLE `monitoring_radar_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`monitoringRecordId` int NOT NULL,
	`radarPointId` varchar(128) NOT NULL,
	`measuredAt` double NOT NULL,
	`displacementMm` double NOT NULL,
	`velocityMmPerDay` double,
	`accelerationMmPerDay2` double,
	`source` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monitoring_radar_readings_id` PRIMARY KEY(`id`)
);
