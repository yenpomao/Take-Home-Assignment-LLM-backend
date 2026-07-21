import "dotenv/config";
import fp from "fastify-plugin";

type AppConfig = {
  DATABASE_URL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  PORT: number;
};

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

function readConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 3000);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-5",
    PORT: port,
  };
}

export const envPlugin = fp(async (app) => {
  app.decorate("config", readConfig());
});
