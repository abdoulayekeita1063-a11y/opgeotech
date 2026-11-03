CREATE TABLE `collaboration_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`workItemId` int NOT NULL,
	`userId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaboration_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaboration_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`userId` int NOT NULL,
	`workItemId` int,
	`type` varchar(64) NOT NULL,
	`message` varchar(500) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaboration_notifications_id` PRIMARY KEY(`id`)
);
