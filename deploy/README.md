# Deploying Gliagora

Everything the production server runs is described in this folder (PLAN §11.5), so a new server can be rebuilt from scratch. The server only pulls and runs images built by CI; it never builds.

| File | What it is |
| --- | --- |
| `setup-server.sh` | One-time hardening of a fresh Ubuntu 24.04 server |
| `compose.prod.yml` | The stack: Caddy, the app, PostgreSQL 18 |
| `Caddyfile` | HTTPS, security headers, `/admin` password, masked access logs |
| `admin-auth.caddy.example` | Template for the second password in front of `/admin` |
| `postgres/init/10-app-database.sh` | Creates the app's own database user on first start |
| `.env.example` | Template for the server's `.env` (domain, image, secrets) |

On the server, everything lives in `/opt/gliagora`:

| Path | Contents |
| --- | --- |
| `/opt/gliagora/.env` | Secrets (mode 600, never committed) |
| `/opt/gliagora/admin-auth.caddy` | `/admin` password hash (mode 600, never committed) |
| Docker volume `gliagora_db-data` | The database |
| Docker volume `gliagora_caddy-data` | TLS certificates |
| Docker volume `gliagora_caddy-logs` | Access logs with masked IPs, kept 14 days |

## Before you start

1. **Server:** Ubuntu 24.04 with your SSH public key installed for root (most providers ask for it when ordering).
2. **DNS (Cloudflare, D1):** `A` records for `gliagora.com` and `www` pointing to the server's IPv4 address (plus `AAAA` for IPv6 if the server has one), all **DNS only** (grey cloud). Add `CAA 0 issue "letsencrypt.org"`. Caddy needs these to get certificates.
3. **Image access:** the image `ghcr.io/ismailtufan123/gliagora` is private unless the package is made public on GitHub. Either make it public (GitHub → your profile → Packages → gliagora → Package settings → Change visibility), or create a GitHub token with only the `read:packages` scope and log in once on the server: `docker login ghcr.io -u <github-username>`.

## 1. Harden the server (once)

From your computer:

```sh
scp deploy/setup-server.sh root@<server-ip>:/root/
ssh -t root@<server-ip> 'ADMIN_USER=gliagora bash /root/setup-server.sh'
```

The script copies root's SSH key to the new user `gliagora`, asks for a sudo password (store it in the password manager), then turns off root and password logins. **Before closing that session**, open a second terminal and check `ssh gliagora@<server-ip>` and `sudo -v`.

## 2. Start the stack (once)

From your computer:

```sh
scp -r deploy/compose.prod.yml deploy/Caddyfile deploy/postgres deploy/.env.example \
  deploy/admin-auth.caddy.example gliagora@<server-ip>:/opt/gliagora/
```

On the server, in `/opt/gliagora`:

```sh
cp .env.example .env && chmod 600 .env
openssl rand -hex 32          # run three times; paste into POSTGRES_PASSWORD, APP_DB_PASSWORD, PAYLOAD_SECRET
nano .env

docker run --rm -it caddy:2.11.4-alpine caddy hash-password    # choose the /admin password
cp admin-auth.caddy.example admin-auth.caddy && chmod 600 admin-auth.caddy
nano admin-auth.caddy         # paste the hash; keep or change the user name

docker compose -f compose.prod.yml up -d --wait
```

Then check https://gliagora.com/ (redirects to `/en/`) and https://gliagora.com/health/ (`{"status":"ok"}`). Open https://gliagora.com/admin/, enter the `/admin` password, and create the first editor account.

## 3. Update to a new version

CI pushes a new image for every merge to `main` (tags `main` and `sha-<commit>`). On the server:

```sh
cd /opt/gliagora
docker compose -f compose.prod.yml pull app
docker compose -f compose.prod.yml up -d --wait
```

The app applies database migrations when it starts. To roll back the app, set `APP_IMAGE=ghcr.io/ismailtufan123/gliagora:sha-<previous commit>` in `.env` and run `up -d --wait` again. Migrations are not undone automatically; if one must be undone, restore the backup taken before the update.

## Useful commands

```sh
docker compose -f compose.prod.yml ps               # status and health
docker compose -f compose.prod.yml logs -f app      # app logs
docker compose -f compose.prod.yml restart caddy    # after editing the Caddyfile or admin-auth.caddy
sudo ufw status verbose                             # firewall
sudo fail2ban-client status sshd                    # blocked SSH addresses
```

## Not included yet

- `staging.gliagora.com` (PLAN §11.5): the same images with their own database, basic auth and `noindex`.
- listmonk (M2) and Umami: each gets its own database and user in the same PostgreSQL.
- Rate limits in Caddy need a plugin and a custom Caddy build. Until then, the admin is protected by the second password and Payload's lockout (5 attempts, 15 minutes).
