# Google Maps setup (local + Vercel)

Letkaya reads a single browser key via Vite:

| Variable | Required | Used for |
| --- | --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | Yes (for Maps) | Maps JavaScript API; Geocoding; optional Places |

Vite only exposes `VITE_*` to the client. Treat this key as **public but restricted** (HTTP referrer + API allowlist), not as a server secret.

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. **Billing** — enable billing on the project (Maps APIs require it; free monthly credit usually covers light demos).
3. **Enable APIs** (APIs & Services → Library):
   - **Maps JavaScript API** (required)
   - **Geocoding API** (required if address → coordinates)
   - **Places API** (optional; only if autocomplete / place details ship)
4. **Create an API key** (APIs & Services → Credentials → Create credentials → API key).
5. **Restrict the key** immediately:

### Application restrictions — HTTP referrers

Add every origin that will load the map (trailing `/*` is recommended):

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
https://*.vercel.app/*
https://YOUR_CUSTOM_DOMAIN/*
```

Notes:

- Vite default dev ports: `5173` (and `5174+` if in use — add those too).
- Preview deployments use `*.vercel.app`; production may use a custom domain — list both.
- After changing referrers, wait a few minutes for Google’s cache.

### API restrictions

Allow only what the app needs, for example:

- Maps JavaScript API
- Geocoding API
- Places API (only if used)

Do **not** enable unrelated APIs (e.g. Directions, Roads) on this browser key.

## 2. Local development

```bash
cp .env.example .env.local
# Paste your key into VITE_GOOGLE_MAPS_API_KEY= (leave blank for Leaflet fallback)
npm run dev          # starts Hono API (:8787) + Vite (:5173)
# or separately:
npm run dev:api
npm run dev:vite
```

`.env` / `.env.local` are gitignored. Restart Vite after changing env vars.

Without a key, map features that depend on Google degrade gracefully (Leaflet/OSM maps; plain address fields; Places autocomplete disabled). Do not commit a real key.

### Places autocomplete

With a key that has **Places API** enabled, address fields on create/edit property use Google Places Autocomplete (ZA). Without Places (or without a key), the same fields remain normal text inputs and geocode-on-save still works via Geocoding API or the local mock.

## 3. Vercel environment variables

`VITE_*` values are **baked in at build time**. Set the var, then **redeploy** (a new build) so the client bundle picks it up.

### If the project is linked (`vercel link`)

```bash
# Interactive (paste key when prompted) — Preview + Production
npx vercel env add VITE_GOOGLE_MAPS_API_KEY preview
npx vercel env add VITE_GOOGLE_MAPS_API_KEY production

# Or non-interactive from a local file / secret store (do not echo into shell history):
printf '%s' "$GOOGLE_MAPS_KEY" | npx vercel env add VITE_GOOGLE_MAPS_API_KEY preview
printf '%s' "$GOOGLE_MAPS_KEY" | npx vercel env add VITE_GOOGLE_MAPS_API_KEY production

# Optional: Development target for `vercel env pull`
printf '%s' "$GOOGLE_MAPS_KEY" | npx vercel env add VITE_GOOGLE_MAPS_API_KEY development

npx vercel env ls
npx vercel --prod   # or push to the production branch to trigger a rebuild
```

Dashboard alternative: Project → Settings → Environment Variables → add `VITE_GOOGLE_MAPS_API_KEY` for Preview and Production → Redeploy.

### First-time link (project not on Vercel yet)

```bash
npx vercel link
npx vercel env add VITE_GOOGLE_MAPS_API_KEY preview
npx vercel env add VITE_GOOGLE_MAPS_API_KEY production
npx vercel --prod
```

Ensure Google key referrers include `https://*.vercel.app/*` and any custom production domain before testing preview/prod URLs.

## 4. CSP / headers

Current `vercel.json` does **not** set a Content-Security-Policy. No change is required for Maps today.

If you add CSP later, allow Google Maps script and tile hosts, for example:

- `script-src`: `https://maps.googleapis.com` `https://maps.gstatic.com`
- `img-src`: `https://maps.gstatic.com` `https://*.googleapis.com` `https://*.ggpht.com` `data:` `blob:`
- `connect-src`: `https://maps.googleapis.com` `https://maps.gstatic.com`
- `style-src`: include `'unsafe-inline'` if the Maps JS injects inline styles (common), or test thoroughly
- `font-src`: `https://fonts.gstatic.com` (if using Google fonts with Maps UI)

`vite.config.ts` has no headers that block Maps. Keep it that way unless you intentionally add CSP in Vite’s `server.headers` / `preview.headers`.

## 5. Security checklist

- [ ] Key restricted by HTTP referrer (localhost + Vercel + prod domain)
- [ ] Key restricted to Maps JavaScript + Geocoding (+ Places only if needed)
- [ ] Real key only in `.env.local` and Vercel env — never in git
- [ ] Redeployed after setting `VITE_GOOGLE_MAPS_API_KEY` on Vercel
- [ ] Billing alerts set in Google Cloud for unexpected usage
