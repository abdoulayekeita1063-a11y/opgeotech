CREATE TABLE `failure_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`incidentDate` double NOT NULL,
	`pit` varchar(128) NOT NULL,
	`phase` varchar(128),
	`wall` varchar(128),
	`bench` varchar(128),
	`lithology` varchar(255),
	`failureType` varchar(255),
	`actionTaken` text,
	`comments` text,
	`pictureReference` text,
	`sourceSheet` varchar(128),
	`sourceFile` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `failure_records_id` PRIMARY KEY(`id`)
);
