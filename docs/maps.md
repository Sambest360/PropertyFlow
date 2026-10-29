# Google Maps setup (local + server)

Lekaya reads a single browser key via Vite:

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
https://lekayarentals.site/*
https://YOUR_CUSTOM_DOMAIN/*
```

Notes:

- Vite default dev ports: `5173` (and `5174+` if in use — add those too).
- Production runs on `lekayarentals.site` — list it alongside localhost.
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

## 3. Server build

`VITE_*` values are **baked in at build time**. Add `VITE_GOOGLE_MAPS_API_KEY` to the server `.env` in `/var/www/propertyflow`, then rebuild with `deploy/update.sh` so the client bundle picks it up.

Ensure the Google key referrers include `https://lekayarentals.site/*`.

## 4. CSP / headers

The Content-Security-Policy lives in `deploy/nginx-security-headers.conf` and already allows the Google Maps script, image and connect hosts.

## 5. Security checklist

- [ ] Key restricted by HTTP referrer (localhost + prod domain)
- [ ] Key restricted to Maps JavaScript + Geocoding (+ Places only if needed)
- [ ] Real key only in `.env.local` and the server `.env` — never in git
- [ ] Rebuilt after setting `VITE_GOOGLE_MAPS_API_KEY` on the server
- [ ] Billing alerts set in Google Cloud for unexpected usage
