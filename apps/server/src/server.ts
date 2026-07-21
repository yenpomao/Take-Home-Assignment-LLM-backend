import { PrismaClient } from "@prisma/client";
import "dotenv/config";

import { buildApp } from "./app.js";

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === "") {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient();
const app = await buildApp({ prisma });

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({
    host: "0.0.0.0",
    port: app.config.PORT,
  });
} catch (error) {
  app.log.error(error instanceof Error ? error : { error });
  process.exit(1);
}
