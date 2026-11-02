CREATE TABLE `berm_comparisons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bermId` varchar(128) NOT NULL,
	`pit` varchar(128) NOT NULL,
	`bench` varchar(128) NOT NULL,
	`status` varchar(32) NOT NULL,
	`surveyDateMs` double,
	`input` json NOT NULL,
	`result` json NOT NULL,
	`createdAtMs` double NOT NULL,
	CONSTRAINT `berm_comparisons_id` PRIMARY KEY(`id`)
);
