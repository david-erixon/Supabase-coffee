import type { Tasting } from "./supabase";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export function toCsv(tastings: Tasting[]) {
  const rows = tastings.map(({ tasted_on, rating, note, product }) =>
    [tasted_on, product.ean, product.roaster, product.name, product.origin_country, product.roast_level, rating, note]
      .map(csvCell)
      .join(","),
  );
  return ["date,ean,roaster,coffee,origin,roast,rating,note", ...rows].join("\n");
}

export function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}
