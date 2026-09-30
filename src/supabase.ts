import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "https://fhenobaonqdwkmnzdgjf.supabase.co";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_c9uzwff1EnfuS4kKa8fp-A_PKEbVy7W";

export const supabase = createClient(url, key);

export type Product = {
  id: string;
  ean: string;
  roaster: string;
  name: string;
  origin_country: string | null;
  roast_level: "light" | "medium" | "dark" | null;
};

export type Tasting = {
  id: string;
  rating: number;
  tasted_on: string;
  note: string | null;
  created_at: string;
  product: Product;
};
