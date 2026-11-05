import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type LocalSupabaseConnection = {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
};

const LOCAL_SUPABASE_PORT = "54322";
const LOCAL_SUPABASE_DATABASE = "postgres";
const FIXTURE_APPLICATION_NAME = "dc-cabs-local-mumbai-fixtures";

export function parseLocalSupabaseDatabaseUrl(value: string | undefined): LocalSupabaseConnection {
  if (!value) {
    throw new Error("Set LOCAL_MUMBAI_TEST_DATABASE_URL to the local Supabase database URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LOCAL_MUMBAI_TEST_DATABASE_URL must be a valid local PostgreSQL URL.");
  }

  const hostname = url.hostname.toLowerCase();
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !isLoopback ||
    url.port !== LOCAL_SUPABASE_PORT ||
    url.pathname !== `/${LOCAL_SUPABASE_DATABASE}` ||
    !url.username ||
    !url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Refusing to load fixtures: the database URL must target local Supabase on loopback port 54322 and database postgres.",
    );
  }

  return {
    host: hostname === "[::1]" ? "::1" : hostname,
    port: url.port,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: LOCAL_SUPABASE_DATABASE,
  };
}

export function runLocalMumbaiFixtures(options: {
  databaseUrl: string | undefined;
  readFixture: () => string;
  applyFixture: (connection: LocalSupabaseConnection, sql: string) => void;
}): void {
  // Validate before reading fixture contents or invoking the database client.
  const connection = parseLocalSupabaseDatabaseUrl(options.databaseUrl);
  const sql = options.readFixture();
  options.applyFixture(connection, sql);
}

function applyWithPsql(connection: LocalSupabaseConnection, sql: string) {
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    env: {
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      PGHOST: connection.host,
      PGPORT: connection.port,
      PGUSER: connection.username,
      PGPASSWORD: connection.password,
      PGDATABASE: connection.database,
      PGSSLMODE: "disable",
      PGAPPNAME: FIXTURE_APPLICATION_NAME,
    },
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      "Local Mumbai fixtures were not applied successfully; inspect the local psql setup.",
    );
  }
}

function main() {
  const fixturePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../supabase/tests/fixtures/mumbai_local_catalog.sql",
  );

  runLocalMumbaiFixtures({
    databaseUrl: process.env["LOCAL_MUMBAI_TEST_DATABASE_URL"],
    readFixture: () => readFileSync(fixturePath, "utf8"),
    applyFixture: applyWithPsql,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local Mumbai fixture setup failed.");
    process.exitCode = 1;
  }
}
