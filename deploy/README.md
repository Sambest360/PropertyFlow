# deploy/

## nginx and TLS (T7)

- `nginx-propertyflow.conf` is what `setup.sh` installs. It is :80 only, with no
  `ssl_certificate` lines, so `nginx -t` passes on a fresh box before any
  certificate exists.
- `nginx-propertyflow.tls.conf.example` is a template that `setup.sh` does NOT
  install. It is the target shape after TLS: a :80 block that is only
  `return 301 https://$host$request_uri;` for `lekayarentals.site` and
  `www.lekayarentals.site`, and a 443 block with the same locations.
- TLS step (manual, after DNS points at the box):
  `certbot --nginx --redirect -d lekayarentals.site -d www.lekayarentals.site`.
  The nginx plugin edits the installed file, adds the 443 server and turns :80
  into the 301.

### Security headers and HSTS

- `nginx-security-headers.conf` is installed at http level as
  `/etc/nginx/conf.d/propertyflow-security-headers.conf` (see its first lines).
- The template includes the same file (`include conf.d/propertyflow-security-headers.conf;`)
  in the 443 server block and inside every 443 location that has its own
  `add_header` (`location /assets/` and `location = /index.html`). nginx drops
  the outer headers in any block that has its own `add_header`, so each such
  block must re-include them.
- HSTS is owned by that nginx snippet: `max-age=31536000; includeSubDomains`, no
  `preload`. The Node API (Hono) does not send HSTS, and the template does not
  set it, so it is sent once. Preload is LATER, after the 301 is proven.

### Certificate renewal (UNVERIFIED on the live server)

- Use the **nginx plugin** (`certbot --nginx`); it is the recommended
  authenticator. It answers the HTTP-01 challenge by temporarily editing nginx
  itself, so the 301-only :80 block is no problem.
- **webroot** also works, but only with `-w /var/www/propertyflow/dist` (Let's
  Encrypt follows the :80 301 to https, and the 443 block serves that folder:
  `root /var/www/propertyflow/dist;` in the 443 block of the live site file
  `/etc/nginx/sites-available/propertyflow` after certbot's edit). It is
  fragile: `deploy/update.sh` and `deploy/release.sh` now build into
  `dist-next` and swap, so they no longer empty live `dist/` for the length of
  the compile, but a renewal that runs during the brief directory swap can
  still lose a challenge file. Any other `-w` folder is not served by nginx here.
- Which authenticator the live box renews with is UNVERIFIED. Suggested check for
  Stanley (names only, no file contents): run `certbot renew --dry-run` and name
  the authenticator it uses (for example from
  `grep authenticator /etc/letsencrypt/renewal/lekayarentals.site.conf`; for
  webroot, also the `webroot_path` name). This, the live nginx edit and the outside
  `curl -I http://...` / `https://...` checks are for the server owner, not the repo.

### After `certbot --nginx` edits the installed file (UNVERIFIED live)

- `certbot --nginx` edits the live site file
  `/etc/nginx/sites-available/propertyflow` (the copy of
  `nginx-propertyflow.conf` that `setup.sh` installs) in place. That file's
  `location /assets/` has its own `add_header Cache-Control` and no include, so
  the live 443 `/assets/` responses would carry no security headers (nginx
  inheritance rule). Only the template has the include there.
- After certbot's edit, the operator must add
  `include conf.d/propertyflow-security-headers.conf;` inside the 443
  `location /assets/` block of `/etc/nginx/sites-available/propertyflow` (as in
  the template), then run `nginx -t` and reload.
- As of 6 Nov 2026 the live installed file (after certbot) was also missing
  `location /assets/` `try_files $uri =404`, so a missing hashed file fell
  through the SPA fallback and returned 200 `text/html`. Certbot edits that
  installed file in place, so after any later certbot run the operator must
  re-check both `location /assets/` (`try_files $uri =404`) and
  `location = /index.html` (no-cache, and the security-header include on 443)
  against the template, then `nginx -t` and reload.
