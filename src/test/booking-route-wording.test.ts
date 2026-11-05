import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const bookingRoutePath = resolve(process.cwd(), "src/routes/book.tsx");

describe("booking route estimate wording", () => {
  it("labels driving time as an estimate and avoids live-traffic claims", () => {
    const source = readFileSync(bookingRoutePath, "utf8");

    expect(source).toContain("Driving route estimate");
    expect(source).toContain("Estimated drive time");
    expect(source).toContain("not live traffic data");
    expect(source).not.toMatch(
      /Includes traffic conditions|\b(?:heavy|moderate|light) traffic\b|\btraffic delay\b/i,
    );
  });
});
