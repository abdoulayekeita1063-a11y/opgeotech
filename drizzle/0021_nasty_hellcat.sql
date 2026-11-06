CREATE TABLE `project_sync_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`projectId` int NOT NULL,
	`createdBy` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`label` varchar(120) NOT NULL,
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `project_sync_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_sync_tokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
