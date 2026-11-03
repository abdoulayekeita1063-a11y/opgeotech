CREATE TABLE `collaboration_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`invitedUserId` int NOT NULL,
	`invitedBy` int NOT NULL,
	`role` enum('manager','engineer','reviewer','viewer') NOT NULL DEFAULT 'engineer',
	`status` enum('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	CONSTRAINT `collaboration_invitations_id` PRIMARY KEY(`id`)
);
