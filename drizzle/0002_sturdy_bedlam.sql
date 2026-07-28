CREATE TABLE `drillholes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planId` int,
	`holeId` varchar(64) NOT NULL,
	`collarX` double NOT NULL,
	`collarY` double NOT NULL,
	`collarZ` double NOT NULL DEFAULT 0,
	`azimuth` double NOT NULL DEFAULT 0,
	`dip` double NOT NULL DEFAULT -90,
	`depth` double NOT NULL,
	`purpose` varchar(128),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drillholes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dxf_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`geometryJson` longtext,
	`entityCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dxf_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kinematic_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`zone` varchar(128),
	`slopeDipDirection` double NOT NULL,
	`slopeDip` double NOT NULL,
	`slopeHeight` double NOT NULL,
	`unitWeight` double NOT NULL,
	`basicFrictionAngle` double NOT NULL,
	`jcs` double NOT NULL,
	`lateralLimit` double NOT NULL DEFAULT 20,
	`inputJson` longtext,
	`resultJson` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kinematic_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `structures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`structureId` varchar(64),
	`zone` varchar(128),
	`structureType` varchar(64) NOT NULL DEFAULT 'joint',
	`dip` double NOT NULL,
	`dipDirection` double NOT NULL,
	`alteration` varchar(128),
	`infill` varchar(128),
	`roughness` varchar(128),
	`jrc` double,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `structures_id` PRIMARY KEY(`id`)
);
