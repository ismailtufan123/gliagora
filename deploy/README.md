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
| `update.sh` | Backup, then pull the new image and restart |
| `backup/backup.sh` | Encrypted backup of the databases and settings (restic) |
| `backup/restore.sh` | Restore, list snapshots, or test a restore without touching production |
| `backup/systemd/` | Timers: nightly backup, monthly restore test |

On the server, everything lives in `/opt/gliagora`:

| Path | Contents |
| --- | --- |
| `/opt/gliagora/.env` | Secrets (mode 600, never committed) |
| `/opt/gliagora/admin-auth.caddy` | `/admin` password hash (mode 600, never committed) |
| Docker volume `gliagora_db-data` | The database |
| Docker volume `gliagora_caddy-data` | TLS certificates |
| Docker volume `gliagora_caddy-logs` | Access logs with masked IPs, kept 14 days |
| `/opt/gliagora/backup/` | Backup scripts, `backup.env` and `restic-password` (mode 600) |
| `/var/backups/gliagora/restic` | Encrypted backup repository |

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
  deploy/admin-auth.caddy.example deploy/update.sh deploy/backup gliagora@<server-ip>:/opt/gliagora/
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

## 3. Turn on backups (once)

Backups are encrypted with restic (PLAN §11.7.1, §18.2). Each night at 00:30 UTC (03:30 in Istanbul):

- each database is dumped and streamed into the encrypted repository, together with `.env`, `admin-auth.caddy` and the Compose files;
- everything from the last 2 days is kept, plus 7 daily, 4 weekly and 6 monthly snapshots. Backups taken before updates and restores never delete anything themselves;
- on Sundays the repository is checked for damage.

On the 1st of each month the latest backup is restored into a temporary container, with no network, and checked.

On the server, in `/opt/gliagora/backup`:

```sh
cp backup.env.example backup.env && chmod 600 backup.env
openssl rand -base64 33 > restic-password && chmod 600 restic-password
cat restic-password           # store this in the password manager NOW: without it the backups are unreadable
sudo ./backup.sh init         # create the repository
sudo ./backup.sh              # first backup
sudo ./restore.sh test        # check that it restores

sudo cp systemd/gliagora-*.service systemd/gliagora-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gliagora-backup.timer gliagora-restore-test.timer
systemctl list-timers 'gliagora-*'
```

**Weekly copy to the operator's computer** (until the second VDS exists at M2). The repository is encrypted, so copying its files is safe. On your computer:

```sh
rsync -a --delete gliagora@<server-ip>:/var/backups/gliagora/restic/ ~/gliagora-backups/restic/
```

To read that copy, install restic and run `restic -r ~/gliagora-backups/restic snapshots` with the password from the password manager.

**Second repository (from M2).** Set `COPY_REPOSITORY` and `COPY_PASSWORD_FILE` in `backup.env`. Each nightly run then also copies the snapshots there and applies the same retention.

**Checking backups:** `cat /var/backups/gliagora/last-success` shows the time of the last good backup; `journalctl -u gliagora-backup` shows the logs. Email alerts come with the mailbox at M2.

## 4. Update to a new version

CI pushes a new image for every merge to `main` (tags `main` and `sha-<commit>`). On the server:

```sh
sudo /opt/gliagora/update.sh
```

It takes a backup (tag `pre-update`), pulls the new image, restarts, and waits until everything is healthy. The app applies database migrations when it starts.

To roll back the app, set `APP_IMAGE=ghcr.io/ismailtufan123/gliagora:sha-<previous commit>` in `.env` and run `sudo ./update.sh` again. Migrations are not undone automatically. If one damaged data, restore the `pre-update` snapshot (below).

## 5. Restore

```sh
cd /opt/gliagora/backup
sudo ./restore.sh list                          # snapshots with their IDs and times
sudo ./restore.sh test <snapshot-id>            # try it in a temporary container first
sudo ./restore.sh database <snapshot-id>        # replace the live database (asks first)
sudo ./restore.sh config latest /root/restored  # get the backed-up .env and settings back
```

`restore.sh database` takes a safety backup (tag `pre-restore`) of the current database, stops the app, recreates the database from the snapshot and starts the app again.

**New server after losing the old one:**

1. Run steps 1 and 2 up to copying the files.
2. Copy the repository back to `/var/backups/gliagora/restic` (from your computer's copy or the second VDS). In `/opt/gliagora/backup`, create `backup.env` from `backup.env.example` and put the password in `restic-password` (both mode 600).
3. Recover `.env` and `admin-auth.caddy` with `sudo ./restore.sh config latest /root/restored`.
4. Start the stack: an empty database is created.
5. Restore the data with `sudo ./restore.sh database latest`.

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
- Automatic rollback when an update fails its health checks (PLAN §11.5): `update.sh` stops and explains how to roll back by hand.
- Rate limits in Caddy need a plugin and a custom Caddy build. Until then, the admin is protected by the second password and Payload's lockout (5 attempts, 15 minutes).
