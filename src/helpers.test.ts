import assert from "node:assert/strict";
import test from "node:test";
import { stars, toCsv } from "./helpers.ts";

test("exports safe CSV and renders ratings", () => {
  const csv = toCsv([
    {
      id: "1",
      rating: 4,
      tasted_on: "2026-09-30",
      note: 'Söt, "rund"',
      created_at: "2026-09-30T12:00:00Z",
      product: {
        id: "p1",
        ean: "7312345678901",
        roaster: "Test",
        name: "Bönan",
        origin_country: "Etiopien",
        roast_level: "light",
      },
    },
  ]);

  assert.match(csv, /"Söt, ""rund"""/);
  assert.equal(stars(4), "★★★★☆");
});
