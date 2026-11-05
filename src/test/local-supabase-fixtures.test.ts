import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseLocalSupabaseDatabaseUrl,
  runLocalMumbaiFixtures,
} from "../../scripts/run-local-mumbai-fixtures";

const fixturePath = resolve(process.cwd(), "supabase/tests/fixtures/mumbai_local_catalog.sql");

describe("local Mumbai Supabase fixtures", () => {
  it.each([
    "https://hodcgcqqjdrashquegfb.supabase.co",
    "postgresql://postgres:secret@db.hodcgcqqjdrashquegfb.supabase.co:5432/postgres",
    "postgresql://postgres:secret@127.0.0.1:5432/postgres",
  ])("rejects non-local or non-Supabase test targets before fixture access", (databaseUrl) => {
    const readFixture = vi.fn(() => readFileSync(fixturePath, "utf8"));
    const applyFixture = vi.fn();

    expect(() => runLocalMumbaiFixtures({ databaseUrl, readFixture, applyFixture })).toThrow(
      /Refusing to load fixtures/,
    );
    expect(readFixture).not.toHaveBeenCalled();
    expect(applyFixture).not.toHaveBeenCalled();
  });

  it("accepts only the configured local Supabase PostgreSQL endpoint", () => {
    expect(
      parseLocalSupabaseDatabaseUrl("postgresql://postgres:local-only@127.0.0.1:54322/postgres"),
    ).toMatchObject({
      host: "127.0.0.1",
      port: "54322",
      username: "postgres",
      database: "postgres",
    });
  });

  it("applies only explicitly marked Mumbai local catalog fixture rows", () => {
    const sql = readFileSync(fixturePath, "utf8");
    expect(sql).toContain("LOCAL TEST ONLY");
    expect(sql).toContain("Mumbai (LOCAL TEST)");
    expect(sql).toContain("BKC (LOCAL TEST)");
    expect(sql).not.toMatch(/Pune|Delhi|Bengaluru|Asian Paints/i);
    expect(sql).not.toMatch(/insert into public\.(vehicle_categories|pricing_rules)/i);
  });
});
