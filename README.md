# Kaffeloggen

En installerbar PWA för att skanna kaffepåsar, spara smakningar och komma ihåg favoriter. Data synkas via Supabase och appen kan publiceras direkt på GitHub Pages.

## Funktioner

- EAN/UPC-skanning med mobilkameran
- Produktförslag från Open Food Facts
- Lösenordsfri inloggning via e-post
- Privat smaklogg med betyg, datum och anteckningar
- CSV-export
- Installerbar app med offline-appskal

## Lokal utveckling

```sh
npm install
npm run dev
```

Projektet är förkonfigurerat för det anslutna Supabase-projektet med dess publika klientnyckel. Den är avsedd att finnas i webbläsaren; all data skyddas av Row Level Security. För att byta projekt kan `VITE_SUPABASE_URL` och `VITE_SUPABASE_PUBLISHABLE_KEY` anges i `.env.local`.

## Supabase

Databasschemat finns i [`supabase/migrations/20260930210000_create_coffee_log.sql`](supabase/migrations/20260930210000_create_coffee_log.sql). Lägg den publicerade GitHub Pages-adressen i **Authentication → URL Configuration → Redirect URLs** i Supabase, till exempel:

```text
https://david-erixon.github.io/Supabase-coffee/
```

## Publicering

Workflow-filen `.github/workflows/deploy-pages.yml` bygger och publicerar `main`. Välj **GitHub Actions** som källa under repots **Settings → Pages** första gången.

```sh
npm test
npm run build
```
