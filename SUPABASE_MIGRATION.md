# Supabase / PostgreSQL migration

The active OPGeotech database remains MySQL/TiDB. The PostgreSQL target is prepared separately and is not connected to the application yet.

## Prepared files

- `drizzle/schema.pg.ts`: PostgreSQL equivalent of the active Drizzle schema.
- `drizzle.pg.config.ts`: Drizzle Kit configuration using `SUPABASE_DATABASE_URL`.
- `drizzle-pg/0000_bright_bill_hollister.sql`: generated initial PostgreSQL schema migration.

## Required connection variable

Set the direct Supabase database connection string on the server only:

```bash
export SUPABASE_DATABASE_URL='postgresql://postgres:<DATABASE_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require'
```

The Supabase project URL and anon/service API keys are not a substitute for this direct PostgreSQL connection string. Never expose the database URL or password as a `VITE_` variable and never commit it.

## Next migration steps

1. Create a full backup/export of the current MySQL/TiDB database.
2. Obtain the Supabase direct database URL and test it without changing `DATABASE_URL`.
3. Apply `drizzle-pg/0000_bright_bill_hollister.sql` to the empty Supabase target.
4. Transform and load MySQL data table by table, preserving numeric IDs where possible.
5. Validate row counts, user IDs, timestamps, JSON payloads, collaboration history, and uploaded-file references.
6. Run OPGeotech against Supabase in a staging environment.
7. Switch the production `DATABASE_URL` only after the staging smoke test succeeds.

The initial generated migration intentionally does not create foreign keys because the current MySQL schema does not define them and existing data may contain orphaned references. Foreign keys and Row Level Security policies should be added after the data audit.
