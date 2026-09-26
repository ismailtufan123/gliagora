# Deploying Gliagora

Everything the production server runs is described in this folder (PLAN §11.5), so a new server can be rebuilt from scratch. The server only pulls and runs images built by CI; it never builds.

**Status:** prepared, never run. The one-time server setup (S) happens just before M4 (PLAN §20, D23); until the operator starts it, nobody works on the server.

| File | What it is |
| --- | --- |
| `setup-server.sh` | One-time hardening of a fresh Ubuntu 24.04 server |
| `compose.prod.yml` | The stack: Caddy, the app, PostgreSQL 18 |
| `Caddyfile` | HTTPS, security headers, `/admin` password, masked access logs |
| `admin-auth.caddy.example` | Template for the second password in front of `/admin` |
| `postgres/init/10-app-database.sh` | Creates the app's own database user on first start |
| `.env.example` | Template for the server's `.env` (domain, image, secrets) |
| `update.sh` | Backup, then restart with the new image and wait until healthy |
| `deploy-remote.sh` | Server side of the GitHub Deploy workflow (the only command its SSH key may run) |
| `backup/backup.sh` | Encrypted backup of the databases and settings (restic) |
| `backup/restore.sh` | Restore, list snapshots, or test a restore without touching production |
| `backup/systemd/` | Timers: nightly backup, monthly restore test |

On the server, everything lives in `/opt/gliagora`:

| Path | Contents |
| --- | --- |
| `/opt/gliagora/.env` | Secrets and the deployed image `APP_IMAGE` (mode 600, never committed) |
| `/opt/gliagora/.env.previous` | `.env` before the last deploy, for a quick rollback |
| `/opt/gliagora/admin-auth.caddy` | `/admin` password hash (mode 600, never committed) |
| Docker volume `gliagora_db-data` | The database |
| Docker volume `gliagora_caddy-data` | TLS certificates |
| Docker volume `gliagora_caddy-logs` | Access logs with masked IPs, kept 14 days |
| `/opt/gliagora/backup/` | Backup scripts, `backup.env` and `restic-password` (mode 600) |
| `/var/backups/gliagora/restic` | Encrypted backup repository |

## How deploys work

Deploys run from GitHub: **Actions → Deploy → Run workflow**, with an image tag (`main` or `sha-<commit>`) (`.github/workflows/deploy.yml`, D27).

1. The workflow connects over SSH with its own key. On the server, that key's line in `authorized_keys` starts with `restrict,command="/opt/gliagora/deploy-remote.sh"`: it can run nothing else, get no shell and forward nothing.
2. It sends the job's own `GITHUB_TOKEN` (valid only while the job runs) on stdin. `deploy-remote.sh` logs in to GHCR with it in a temporary Docker config, pulls the images and deletes that config. **No registry login is stored on the server.**
3. It records the new image in `.env` (the old file stays as `.env.previous`) and runs `update.sh --no-pull`:
   - a `pre-update` backup, skipped only on the very first start, when there is no database yet;
   - a restart;
   - a wait until every service is healthy. The app applies database migrations when it starts.

Without the four `DEPLOY_*` secrets the workflow stops with a notice ("Deploy skipped") and changes nothing, so it is safe to leave in place before the server exists.

## Before you start

1. **Server:** Ubuntu 24.04 with your SSH public key installed for root (most providers ask for it when ordering).
2. **DNS (Cloudflare, D1):** `A` records for `gliagora.com` and `www` pointing to the server's IPv4 address (plus `AAAA` for IPv6 if the server has one), all **DNS only** (grey cloud). Add `CAA 0 issue "letsencrypt.org"`. Caddy needs these to get certificates.
3. **Deploy key:** on your computer, create a key pair used only by the Deploy workflow:

   ```sh
   ssh-keygen -t ed25519 -N '' -C gliagora-deploy -f gliagora-deploy
   ```

   `gliagora-deploy.pub` goes to the server (step 1). `gliagora-deploy` (the private key) goes only into a GitHub secret (step 4); delete your local copy afterwards.

## 1. Harden the server (once)

From your computer:

```sh
scp deploy/setup-server.sh root@<server-ip>:/root/
ssh -t root@<server-ip> "ADMIN_USER=gliagora DEPLOY_PUBLIC_KEY='$(cat gliagora-deploy.pub)' bash /root/setup-server.sh"
```

The script:

- copies root's SSH key to the new user `gliagora` and asks for a sudo password (store it in the password manager);
- turns off root and password logins;
- installs the deploy key, restricted to `deploy-remote.sh`;
- lets `gliagora` run `update.sh --no-pull` as root without a password, which the deploy needs for the backup.

**Before closing that session**, open a second terminal and check `ssh gliagora@<server-ip>` and `sudo -v`.

## 2. Prepare the stack (once)

From your computer:

```sh
scp -r deploy/compose.prod.yml deploy/Caddyfile deploy/postgres deploy/.env.example \
  deploy/admin-auth.caddy.example deploy/update.sh deploy/deploy-remote.sh deploy/backup \
  gliagora@<server-ip>:/opt/gliagora/
```

On the server, in `/opt/gliagora`:

```sh
cp .env.example .env && chmod 600 .env
openssl rand -hex 32          # run three times; paste into POSTGRES_PASSWORD, APP_DB_PASSWORD, PAYLOAD_SECRET
nano .env

docker run --rm -it caddy:2.11.4-alpine caddy hash-password    # choose the /admin password
cp admin-auth.caddy.example admin-auth.caddy && chmod 600 admin-auth.caddy
nano admin-auth.caddy         # paste the hash; keep or change the user name
```

Do not start the stack by hand: the first deploy (step 5) pulls the images and starts it.

## 3. Prepare backups (once)

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
sudo cp systemd/gliagora-*.service systemd/gliagora-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

The timers are switched on after the first deploy (step 5).

**Weekly copy to the operator's computer** (until the second VDS exists at M2). The repository is encrypted, so copying its files is safe. On your computer:

```sh
rsync -a --delete gliagora@<server-ip>:/var/backups/gliagora/restic/ ~/gliagora-backups/restic/
```

To read that copy, install restic and run `restic -r ~/gliagora-backups/restic snapshots` with the password from the password manager.

**Second repository (from M2).** Set `COPY_REPOSITORY` and `COPY_PASSWORD_FILE` in `backup.env`. Each nightly run then also copies the snapshots there and applies the same retention.

**Checking backups:** `cat /var/backups/gliagora/last-success` shows the time of the last good backup; `journalctl -u gliagora-backup` shows the logs. Alerts are decided during S (D23).

## 4. Connect GitHub (once)

In GitHub: repository **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | The server's IP address (or `gliagora.com` once DNS works) |
| `DEPLOY_USER` | `gliagora` |
| `DEPLOY_SSH_KEY` | The whole content of the private key file `gliagora-deploy` |
| `DEPLOY_KNOWN_HOSTS` | The output of `ssh-keyscan -t ed25519 <server-ip>` run on your computer |

Check `DEPLOY_KNOWN_HOSTS` before saving it: on the server, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` shows the fingerprint. `ssh-keygen -lf <(ssh-keyscan -t ed25519 <server-ip>)` on your computer must show the same one. The workflow refuses any other host key.

## 5. First deploy (once)

1. GitHub: **Actions → Deploy → Run workflow**, tag `main`. The log ends with "Deployed ghcr.io/…:main".
2. Check https://gliagora.com/ (redirects to `/en/`) and https://gliagora.com/health/ (`{"status":"ok"}`).
3. Open https://gliagora.com/admin/, enter the `/admin` password, and create the first editor account.
4. On the server, take the first backup, test it and switch on the timers:

   ```sh
   cd /opt/gliagora/backup
   sudo ./backup.sh
   sudo ./restore.sh test
   sudo systemctl enable --now gliagora-backup.timer gliagora-restore-test.timer
   systemctl list-timers 'gliagora-*'
   ```

## 6. Update and roll back

CI pushes a new image for every merge to `main` (tags `main` and `sha-<commit>`). To update, run the Deploy workflow with `main`, or with the `sha-<commit>` of a specific merge.

To roll back, run the Deploy workflow with the previous `sha-<commit>` tag. On the server, without GitHub, `cp .env.previous .env && sudo ./update.sh --no-pull` goes back to the image that ran before the last deploy; it is still on the server. Migrations are not undone automatically. If one damaged data, restore the `pre-update` snapshot (below).

## 7. Restore

```sh
cd /opt/gliagora/backup
sudo ./restore.sh list                          # snapshots with their IDs and times
sudo ./restore.sh test <snapshot-id>            # try it in a temporary container first
sudo ./restore.sh database <snapshot-id>        # replace the live database (asks first)
sudo ./restore.sh config latest /root/restored  # get the backed-up .env and settings back
```

`restore.sh database` takes a safety backup (tag `pre-restore`) of the current database, stops the app, recreates the database from the snapshot and starts the app again.

**New server after losing the old one:**

1. Run steps 1 and 2 (with a new deploy key if the old one is lost; update the GitHub secrets).
2. Copy the repository back to `/var/backups/gliagora/restic` (from your computer's copy or the second VDS). In `/opt/gliagora/backup`, create `backup.env` from `backup.env.example` and put the password in `restic-password` (both mode 600).
3. Recover `.env` and `admin-auth.caddy` with `sudo ./restore.sh config latest /root/restored`.
4. Run the Deploy workflow with the last good `sha-<commit>` tag: it starts the stack with an empty database.
5. Restore the data with `sudo ./restore.sh database latest`, then switch on the timers (step 5).

## Useful commands

```sh
docker compose -f compose.prod.yml ps               # status and health
docker compose -f compose.prod.yml logs -f app      # app logs
docker compose -f compose.prod.yml restart caddy    # after editing the Caddyfile or admin-auth.caddy
sudo ufw status verbose                             # firewall
sudo fail2ban-client status sshd                    # blocked SSH addresses
```

## Decided during the server setup (S, D23)

- Staging (`staging.gliagora.com`): the same images with their own database, basic auth and `noindex`, or none.
- Automatic rollback when an update fails its health checks. Until then, `update.sh` stops and explains how to roll back by hand.
- Rate limits in Caddy, which need a plugin and a custom Caddy build. Until then, the admin is protected by the second password and Payload's lockout (5 attempts, 15 minutes).
- Backup alerts (success and failure emails).

listmonk (M2) and Umami each get their own database and user in the same PostgreSQL later.
