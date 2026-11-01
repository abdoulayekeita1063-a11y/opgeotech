CREATE TABLE `piezometers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`easting` double NOT NULL,
	`northing` double NOT NULL,
	`elevation` double NOT NULL,
	`depth` double NOT NULL,
	`waterLevel` double NOT NULL,
	`piezometricElevation` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `piezometers_id` PRIMARY KEY(`id`)
);
