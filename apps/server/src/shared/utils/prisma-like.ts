import type { PrismaClient } from "@prisma/client";

export type PrismaLikeClient = Pick<PrismaClient, "conversationSession" | "message">;
