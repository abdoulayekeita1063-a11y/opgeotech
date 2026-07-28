CREATE TABLE `blast_assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`blastDate` varchar(32) NOT NULL,
	`zone` varchar(255) NOT NULL,
	`beforePhotoUrl` text,
	`beforePhotoKey` text,
	`afterPhotoUrl` text,
	`afterPhotoKey` text,
	`notes` text,
	`qualityScore` double,
	`fragmentationRating` varchar(64),
	`overbreakDetected` varchar(64),
	`analysisJson` json,
	`generatedReport` text,
	`status` enum('draft','analyzed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blast_assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `compliance_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`zone` varchar(255),
	`designBenchHeight` double NOT NULL,
	`actualBenchHeight` double NOT NULL,
	`designBermWidth` double NOT NULL,
	`actualBermWidth` double NOT NULL,
	`designBatterAngle` double NOT NULL,
	`actualBatterAngle` double NOT NULL,
	`toleranceHeight` double NOT NULL DEFAULT 0.5,
	`toleranceBerm` double NOT NULL DEFAULT 1,
	`toleranceAngle` double NOT NULL DEFAULT 2,
	`compliant` int NOT NULL,
	`compliancePct` double NOT NULL,
	`details` json,
	`interpretation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `compliance_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspection_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`inspectionDate` varchar(32) NOT NULL,
	`inspector` varchar(255),
	`zones` text NOT NULL,
	`weather` varchar(255) NOT NULL,
	`observations` text NOT NULL,
	`anomalies` text,
	`actions` text,
	`generatedReport` text,
	`status` enum('draft','generated') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inspection_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rock_classifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`zone` varchar(255),
	`system` enum('RMR','Q','GSI') NOT NULL,
	`inputs` json NOT NULL,
	`score` double NOT NULL,
	`rockClass` varchar(64),
	`interpretation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rock_classifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stability_calcs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`zone` varchar(255),
	`cohesion` double NOT NULL,
	`frictionAngle` double NOT NULL,
	`unitWeight` double NOT NULL,
	`slopeHeight` double NOT NULL,
	`slopeAngle` double NOT NULL,
	`waterCondition` enum('dry','partial','saturated') NOT NULL DEFAULT 'dry',
	`fsFellenius` double NOT NULL,
	`fsBishop` double NOT NULL,
	`interpretation` text,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stability_calcs_id` PRIMARY KEY(`id`)
);
