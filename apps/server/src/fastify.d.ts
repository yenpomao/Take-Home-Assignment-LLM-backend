import type { PrismaLikeClient } from "./shared/utils/prisma-like.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaLikeClient;
  }
}
