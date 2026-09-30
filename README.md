# Kaffeloggen

En installerbar PWA för att skanna kaffepåsar, spara smakningar och komma ihåg favoriter. Data synkas via Supabase och appen kan publiceras direkt på GitHub Pages.

## Funktioner

- EAN/UPC-skanning med mobilkameran
- Produktförslag från Open Food Facts
- Lösenordsfri inloggning via e-post
- Passkey-inloggning med Face ID, fingeravtryck eller enhetens kod
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

Databasschemat finns i [`supabase/migrations/20260930210000_create_coffee_log.sql`](supabase/migrations/20260930210000_create_coffee_log.sql). Använd följande inställningar i Supabase:

```text
Site URL: https://kaffeloggen.brownfox.tech/
Redirect URL: https://kaffeloggen.brownfox.tech/
Passkey RP ID: kaffeloggen.brownfox.tech
Passkey origin: https://kaffeloggen.brownfox.tech
```

Ändra passkey-domänen innan några nycklar registreras. Ett senare byte av RP ID gör befintliga passkeys oanvändbara.

## Publicering

Workflow-filen `.github/workflows/deploy-pages.yml` bygger och publicerar `main`. Välj **GitHub Actions** som källa under repots **Settings → Pages** första gången.

Ange `kaffeloggen.brownfox.tech` som **Custom domain** under **Settings → Pages**. Skapa därefter följande DNS-record i Route 53:

```text
Type:  CNAME
Name:  kaffeloggen
Value: david-erixon.github.io
```

Aktivera **Enforce HTTPS** när GitHub har utfärdat certifikatet. En `CNAME`-fil behövs inte när publiceringen sker via GitHub Actions.

```sh
npm test
npm run build
```
