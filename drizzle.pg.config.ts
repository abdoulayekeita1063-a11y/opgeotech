import { defineConfig } from "drizzle-kit";

const connectionString =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL is required to run PostgreSQL Drizzle commands"
  );
}

export default defineConfig({
  schema: "./drizzle/schema.pg.ts",
  out: "./drizzle-pg",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
