CREATE TABLE `drillhole_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`holeId` varchar(64) NOT NULL,
	`metadataJson` longtext,
	`rowsJson` longtext,
	`comments` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drillhole_logs_id` PRIMARY KEY(`id`)
);
