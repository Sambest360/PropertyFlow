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
  in the 443 server block and inside `location /assets/`, the only location with
  its own `add_header`. nginx drops the outer headers in any block that has its
  own `add_header`, so each such block must re-include them.
- HSTS is owned by that nginx snippet: `max-age=31536000; includeSubDomains`, no
  `preload`. The Node API (Hono) does not send HSTS, and the template does not
  set it, so it is sent once. Preload is LATER, after the 301 is proven.

### Certificate renewal (UNVERIFIED on the live server)

- Renewal must use the **nginx** authenticator (`certbot --nginx`), which
  answers the HTTP-01 challenge by temporarily editing nginx itself, so it keeps
  working with the 301-only :80 block.
- A **webroot** authenticator is not safe with this shape: it writes challenge
  files under a webroot directory, and the 301-only :80 block serves no files.
  It would only pass if the https side happened to serve that same directory at
  `/.well-known/acme-challenge/`, which nothing here sets up.
- Which authenticator the live box renews with is UNVERIFIED. Check (names only):
  `grep authenticator /etc/letsencrypt/renewal/lekayarentals.site.conf` and
  `certbot renew --dry-run`. This, the live nginx edit and the outside
  `curl -I http://...` / `https://...` checks are for the server owner, not the repo.
