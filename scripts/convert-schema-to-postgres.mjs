import fs from "node:fs";

const source = fs.readFileSync("drizzle/schema.ts", "utf8");
let out = source
  .replace(
    'import {\n  double,\n  int,\n  json,\n  longtext,\n  mysqlEnum,\n  mysqlTable,\n  text,\n  timestamp,\n  varchar,\n} from "drizzle-orm/mysql-core";',
    'import {\n  doublePrecision,\n  integer,\n  jsonb,\n  pgTable,\n  text,\n  timestamp,\n  varchar,\n} from "drizzle-orm/pg-core";'
  )
  .replace(/mysqlTable/g, "pgTable")
  .replace(/\bdouble\(/g, "doublePrecision(")
  .replace(/\bint\(/g, "integer(")
  .replace(/\bjson\(/g, "jsonb(")
  .replace(/\blongtext\(/g, "text(")
  .replace(
    /\.autoincrement\(\)\.primaryKey\(\)/g,
    ".generatedByDefaultAsIdentity().primaryKey()"
  )
  .replace(/\.onUpdateNow\(\)/g, "");

function replaceEnums(input) {
  let result = "";
  let cursor = 0;
  while (true) {
    const start = input.indexOf("mysqlEnum(", cursor);
    if (start < 0) return result + input.slice(cursor);
    result += input.slice(cursor, start);
    let i = start + "mysqlEnum(".length;
    let depth = 1;
    let quote = null;
    for (; i < input.length; i++) {
      const ch = input[i];
      if (quote) {
        if (ch === quote && input[i - 1] !== "\\") quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) break;
    }
    const args = input.slice(start + "mysqlEnum(".length, i);
    const match = args.match(/^\s*(["'][^"']+["'])\s*,\s*\[([\s\S]*)\]\s*$/);
    if (!match) throw new Error(`Could not convert enum: ${args}`);
    const field = match[1];
    const values = [...match[2].matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
    const union = values.map(v => JSON.stringify(v)).join(" | ");
    result += `text(${field}).$type<${union}>()`;
    cursor = i + 1;
  }
}
out = replaceEnums(out);
out = `/** PostgreSQL/Supabase schema generated from the active MySQL schema. Do not edit manually. */\n${out}`;
fs.writeFileSync("drizzle/schema.pg.ts", out);
