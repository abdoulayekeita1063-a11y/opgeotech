CREATE TABLE `collaboration_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`projectId` int,
	`workItemId` int,
	`userId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`beforePayload` json,
	`afterPayload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaboration_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaboration_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaboration_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaboration_sync_operations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`teamId` int NOT NULL,
	`workItemId` int,
	`operationType` enum('create','update') NOT NULL,
	`baseVersion` int,
	`payload` json NOT NULL,
	`status` enum('pending','applied','conflict','rejected') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`appliedAt` timestamp,
	CONSTRAINT `collaboration_sync_operations_id` PRIMARY KEY(`id`),
	CONSTRAINT `collaboration_sync_operations_operationId_unique` UNIQUE(`operationId`)
);
--> statement-breakpoint
CREATE TABLE `collaboration_team_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','manager','engineer','reviewer','viewer') NOT NULL DEFAULT 'engineer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaboration_team_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaboration_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaboration_teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaboration_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workItemId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`userId` int NOT NULL,
	`payload` json NOT NULL,
	`changeSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaboration_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaboration_work_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`projectId` int NOT NULL,
	`module` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`status` enum('draft','in_progress','waiting_review','returned','reviewed','approved','archived') NOT NULL DEFAULT 'draft',
	`assignedTo` int,
	`payload` json NOT NULL,
	`versionNumber` int NOT NULL DEFAULT 1,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collaboration_work_items_id` PRIMARY KEY(`id`)
);
