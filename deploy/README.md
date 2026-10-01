# Deploying Gliagora

Everything the production server runs is described in this folder (PLAN §11.5), so a new server can be rebuilt from scratch. The server only pulls and runs images built by CI; it never builds.

**Status:** running since the one-time server setup (S) on 2026-09-30. The whole site is behind the site-wide password except `/health/` until M2 (D32). PLAN §20 ("S notes") has the setup's facts and checks; D42 the decisions.

## This server

| | |
| --- | --- |
| Provider | Hosting Türkiye Micro Paket (KVM, Istanbul), host name `vps-4448` |
| System | Ubuntu 24.04 LTS, 3 vCPU, 4 GB RAM plus 2 GB swap, 40 GB disk; network MTU 1400 |
| Addresses | `45.144.214.78` and `2a0f:85c1:7f5:6e::1` (Cloudflare DNS, DNS only: `A` and `AAAA` for `gliagora.com`, `www` as a `CNAME`) |
| SSH host key | ED25519 `SHA256:2Xl/K1bL4dalAwaHVZKLQjv7Kx2mNSV5nOGlO+FCCzk` (also in the secret `DEPLOY_KNOWN_HOSTS`) |
| Log in | `ssh gliagora@45.144.214.78` with the operator's key (`gliagora-linux` or `gliagora-prod`) |
| Show the site-wide password (user `editor`) | `ssh -t gliagora@45.144.214.78 sudo cat /root/site-password` |
| Show the backup password | `ssh -t gliagora@45.144.214.78 sudo cat /opt/gliagora/backup/restic-password` |
| Deploy | Automatic after every green CI run on `main` until M2, then on release tags `v…` (D43); by hand: GitHub → Actions → Deploy → Run workflow (`main`), or `gh workflow run deploy.yml --ref main -f tag=main` |

| File | What it is |
| --- | --- |
| `setup-server.sh` | One-time hardening of a fresh Ubuntu 24.04 server: admin user, deploy user, firewall, fail2ban, Docker, swap |
| `compose.prod.yml` | The stack: Caddy, the app, PostgreSQL 18 |
| `Caddyfile` | HTTPS, security headers, the site-wide password (until M2 the whole site except `/health/`; always `/admin` and `/api`), masked logs (the access log and Caddy's own log) |
| `admin-auth.caddy.example` | Template for the site-wide password |
| `postgres/init/10-app-database.sh` | Creates the app's own database user on first start |
| `.env.example` | Template for the server's `.env` (domain, image, secrets) |
| `update.sh` | Backup, then restart with the new image and wait until healthy |
| `deploy-remote.sh` | Server side of the GitHub Deploy workflow (the only command its SSH key may run), with the automatic rollback |
| `backup/backup.sh` | Encrypted backup of the databases and settings (restic) |
| `backup/restore.sh` | Restore, list snapshots, or test a restore without touching production |
| `backup/systemd/` | Timers: nightly backup, monthly restore test |
| `basemap/fetch-basemap.sh` | Puts the map's basemap (tiles, fonts, sprites) on the server; run about twice a year (step 8) |

On the server, everything lives in `/opt/gliagora`:

| Path | Contents |
| --- | --- |
| `/opt/gliagora/.env` | Secrets and the deployed image `APP_IMAGE` (mode 600, never committed) |
| `/opt/gliagora/.env.previous` | `.env` before the last deploy, for the rollback |
| `/opt/gliagora/admin-auth.caddy` | Hash of the site-wide password (mode 600, never committed) |
| `/root/site-password` | The site-wide password itself, readable only by root, until you have saved it in your password manager |
| Docker volume `gliagora_db-data` | The database |
| Docker volume `gliagora_caddy-data` | TLS certificates |
| Docker volume `gliagora_caddy-logs` | Access logs with masked IPs, kept 14 days |
| `/opt/gliagora/backup/` | Backup scripts, `backup.env` (mode 600) and `restic-password` (readable only by root) |
| `/var/backups/gliagora/restic` | Encrypted backup repository |
| `/opt/gliagora/basemap/public` | The map's basemap, served by Caddy at `/basemap/` (step 8); not backed up, fetched again |

## Who logs in

- **`gliagora`**, the admin: logs in with the operator's SSH keys (copied from root's), uses `sudo` without a password and is in the `docker` group. SSH accepts keys only; root cannot log in.
- **`deploy`**, used only by the Deploy workflow: not an admin (not in the `sudo` or `docker` group), no password, and its only key can run nothing but `deploy-remote.sh`. One sudo rule (`/etc/sudoers.d/gliagora-deploy`) lets it run that script as root, without arguments, and each run is logged. Its `authorized_keys` belongs to root, so the user cannot change it.

## How deploys work

Deploys run from GitHub, through the **Deploy** workflow (`.github/workflows/deploy.yml`, D27, D43), in one of three ways:

| When | How | Repository variable `DEPLOY_AUTO` |
| --- | --- | --- |
| **Now, while the site is private (until M2)** | Automatically after every CI run of a push to `main` that passes: the image of exactly that commit (`sha-` plus its first 7 characters) | `main` |
| **From M2 on** | Automatically when a release tag is pushed, only for a commit on `main` whose CI run passed: `git tag v2026.11.3 <commit> && git push origin v2026.11.3` (the name must start with `v`). A commit that changed only documentation has no CI run and no image of its own (D46): its tag deploys the image of the newest commit before it whose CI passed, if only documentation changed since; a tag that cannot be deployed fails with a message | `tags` |
| **Any time** (also to roll back on purpose) | By hand: **Actions → Deploy → Run workflow** on `main`, with an image tag: `main`, or `sha-` plus the first 7 characters of a commit | any |

At M2, switch from the first row to the second: **Settings → Secrets and variables → Actions → Variables**, `DEPLOY_AUTO` = `tags` (or `gh variable set DEPLOY_AUTO --body tags`). Any other value (or none) leaves only the manual way. A run that may not deploy stops with a notice ("Deploy skipped") and changes nothing; so does a re-run of an older commit's CI after a newer one has passed. Deploys never overlap; when several wait, only the newest runs.

Each deploy then goes like this:

1. The workflow connects over SSH as `deploy`, with its own key, and checks the server's host key against the one pinned in a secret. On the server, that key's line in `/home/deploy/.ssh/authorized_keys` starts with `restrict,command="sudo -n /opt/gliagora/deploy-remote.sh"`: it can run nothing else, get no shell and forward nothing.
2. It sends the job's own `GITHUB_TOKEN` (valid only while the job runs) on stdin. `deploy-remote.sh` accepts only `deploy main` or `deploy sha-<7 characters>`, logs in to GHCR with the token in a temporary Docker config, pulls the images and deletes that config. **No registry login is stored on the server.**
3. It pins the image to the commit it was built from (`main` becomes `sha-<commit>`), records it in `.env` (the old file stays as `.env.previous`) and runs `update.sh --no-pull`:
   - a `pre-update` backup (the database is started first if it was stopped), skipped only on the very first start, when there is no database volume yet;
   - a restart;
   - a wait (at most 5 minutes) until every service is healthy. The app applies database migrations when it starts.
4. If that fails before the app was restarted (for example, the backup fails), `.env` goes back to the previous image and nothing else changed. **If the new image started but did not become healthy, the script switches back to the previous image by itself** (it is still on the server) and waits for it (D42). The workflow then fails with "Rolled back to …", so you see it. Database migrations are not undone; if the new version's migrations broke something, restore the `pre-update` snapshot (step 7).

A deploy changes only the app's image. The other files in this folder (`compose.prod.yml`, the `Caddyfile`, the scripts) reach the server only when you copy them (step 2's `scp`), and take effect only then: the scripts at once, `compose.prod.yml` with `sudo ./update.sh --no-pull` in `/opt/gliagora`, and a changed `Caddyfile` (or `admin-auth.caddy`) only when Caddy restarts (`docker compose -f compose.prod.yml restart caddy`), which `update.sh` does not do for a changed file. The deploy key cannot change the server's configuration, so a leaked key cannot either.

Until the repository variable `DEPLOY_ENABLED` is `true`, the workflow stops with a notice ("Deploy skipped") and changes nothing, whatever `DEPLOY_AUTO` says: it is the main switch. Run by hand, it also refuses any branch other than `main`.

## Before you start

1. **Server:** Ubuntu 24.04 with your SSH public key installed for root (most providers ask for it when ordering).
2. **DNS (Cloudflare, D1):** `A` (and, if the server has IPv6, `AAAA`) records for `gliagora.com`, and `www` as a `CNAME` to it, all **DNS only** (grey cloud). Caddy needs these to get certificates. Add `CAA 0 issue "letsencrypt.org"`. With an `AAAA` record, Let's Encrypt checks over IPv6 first, so IPv6 must work on the server before the first deploy; the IPv6 check in step 5 confirms that Caddy also sees IPv6 visitors' real addresses.
3. **Deploy key:** on your computer, create a key pair used only by the Deploy workflow, outside the repository folder:

   ```sh
   ssh-keygen -t ed25519 -N '' -C gliagora-deploy -f ~/.ssh/gliagora-deploy
   ```

   `~/.ssh/gliagora-deploy.pub` goes to the server (step 1). `~/.ssh/gliagora-deploy` (the private key) goes only into a GitHub secret (step 4); delete your local copy afterwards.

## 1. Harden the server (once)

From your computer:

```sh
scp deploy/setup-server.sh root@<server-ip>:/root/
ssh root@<server-ip> "ADMIN_USER=gliagora DEPLOY_PUBLIC_KEY='$(cat ~/.ssh/gliagora-deploy.pub)' bash /root/setup-server.sh"
```

The script:

- installs updates and turns on automatic security updates (with a reboot at 01:30 UTC when an update needs one);
- copies root's SSH keys to the new admin user `gliagora`, who uses `sudo` without a password (D42);
- turns off root and password logins (`/etc/ssh/sshd_config.d/00-gliagora.conf`, read before the provider's files, so its values win) and lets only `gliagora` and `deploy` log in;
- opens only 22 (rate-limited), 80 and 443 in the firewall, and starts fail2ban;
- installs Docker, with the network's MTU where the server's network is smaller than 1500;
- creates the user `deploy` with the deploy key, restricted to `deploy-remote.sh`, and its one sudo rule.

**Before closing that session**, check in a second terminal that `ssh gliagora@<server-ip>` works and that `sudo -n true && echo ok` prints `ok`. If `/var/run/reboot-required` exists afterwards, reboot once (`sudo reboot`) before continuing.

## 2. Prepare the stack (once)

From your computer:

```sh
scp -r deploy/compose.prod.yml deploy/Caddyfile deploy/postgres deploy/.env.example \
  deploy/admin-auth.caddy.example deploy/update.sh deploy/deploy-remote.sh deploy/backup deploy/basemap \
  gliagora@<server-ip>:/opt/gliagora/
```

On the server, in `/opt/gliagora`, create `.env` with four new secrets. They are generated on the server and never shown; nobody needs to know them:

```sh
cd /opt/gliagora
umask 077
while IFS= read -r line; do
  case "$line" in
    POSTGRES_PASSWORD=* | APP_DB_PASSWORD=* | PAYLOAD_SECRET=* | ALTCHA_HMAC_KEY=*)
      printf '%s=%s\n' "${line%%=*}" "$(openssl rand -hex 32)" ;;
    *) printf '%s\n' "$line" ;;
  esac
done < .env.example > .env
```

Then the **site-wide password** (the user name is `editor`): it is generated into a file only root can read, and only its hash goes into `admin-auth.caddy`:

```sh
sudo sh -c 'umask 077 && { tr -dc A-Za-z0-9 < /dev/urandom | head -c 32; echo; } > /root/site-password'
hash=$(sudo cat /root/site-password | docker run --rm -i caddy:2.11.4-alpine caddy hash-password)
printf 'basic_auth {\n\teditor %s\n}\n' "$hash" > admin-auth.caddy
```

`caddy hash-password` reads one line from the pipe and fails ("Error: EOF") if the line does not end with a newline, hence the `echo`.

Show it in your own terminal, to save it in your password manager: `ssh -t gliagora@<server-ip> sudo cat /root/site-password`. In scripted checks, send it with `curl -K -` from that file (`printf 'user = "editor:%s"\n' "$(sudo head -n1 /root/site-password)" | curl -K - …`) and never print curl's `%{redirect_url}` or its `-v` output: both repeat the credentials. Once it is saved, you may delete the file (`sudo rm /root/site-password`); the server needs only the hash. To change the password later, run the same three commands and restart Caddy (`docker compose -f compose.prod.yml restart caddy`).

Leave the `SMTP_*` settings empty until the Turkish mailbox is set up at M2 (its SMTP server sends the email; PLAN §11.7.1, D22): until then the app sends no email (the outcome of suggestions, the acknowledgement of reports) and writes no address to its logs. Admin password resets do not arrive either; reset a password by hand. Setting `SMTP_HOST` also switches on member sign-in by email link (its form also needs `ALTCHA_HMAC_KEY`, which is set), so before setting it, copy the deploy files, restart Caddy and check its logs as in step 1 of "Switching on member sign-in" (section 9).

Do not start the stack by hand: the first deploy (step 5) pulls the images and starts it.

## 3. Prepare backups (once)

Backups are encrypted with restic (PLAN §11.7.1, §18.2). Each night at 00:30 UTC (03:30 in Istanbul):

- each database is dumped and streamed into the encrypted repository, together with `.env`, `admin-auth.caddy` and the Compose files. The rows of `form_limits` (hashed IP addresses for the form rate limits, kept 24 hours in the app database only, D34), `member_sessions` and `email_tokens` (members' sessions and email links, D49) are left out; after a restore the limits start empty, every member is signed out and no email link works;
- everything from the last 2 days is kept, plus 7 daily, 4 weekly and 6 monthly snapshots. Backups taken before updates and restores never delete anything themselves;
- on Sundays the repository is checked for damage.

On the 1st of each month the latest backup is restored into a temporary container, with no network, and checked.

On the server, in `/opt/gliagora/backup`, create the settings and the **backup password** (in a file only root can read):

```sh
cd /opt/gliagora/backup
cp backup.env.example backup.env && chmod 600 backup.env
sudo sh -c 'umask 077 && openssl rand -base64 33 > /opt/gliagora/backup/restic-password'
sudo ./backup.sh init         # create the repository
sudo cp systemd/gliagora-*.service systemd/gliagora-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

**Save the backup password in your password manager now**: without it the backups are unreadable, also for you. Show it in your own terminal with `ssh -t gliagora@<server-ip> sudo cat /opt/gliagora/backup/restic-password`. Unlike the site-wide password, this file stays on the server: the nightly backup needs it.

The timers are switched on after the first deploy (step 5).

**Weekly copy to the operator's computer** (until the second VDS exists at M2). The repository is encrypted, so copying its files is safe. It holds only the database dumps and a few settings files (about 20 MB in October 2026), never the map's basemap, which is downloaded again instead (step 8). On your computer:

```sh
rsync -a --delete gliagora@<server-ip>:/var/backups/gliagora/restic/ ~/gliagora-backups/restic/
```

To read that copy, install restic and run `restic -r ~/gliagora-backups/restic snapshots` with the password from the password manager.

**Second repository (from M2).** Set `COPY_REPOSITORY` and `COPY_PASSWORD_FILE` in `backup.env`. Each nightly run then also copies the snapshots there and applies the same retention.

**Checking backups:** `cat /var/backups/gliagora/last-success` shows the time of the last good backup; `journalctl -u gliagora-backup` shows the logs. Emails on success and failure come at M2 with the mailbox (D42); until then, check `last-success` now and then.

## 4. Connect GitHub (once)

GitHub Free has no environments (with branch rules and required reviewers) for a private repository, so the deploy settings are **repository secrets** (D42). Any workflow on any branch of the repository could read them; they unlock little (a login as `deploy`, which can only deploy a `main` or `sha-` image of this repository), and only the operator can push to the repository.

1. **Settings → Secrets and variables → Actions → Secrets → New repository secret**, four times (or `gh secret set NAME` on your computer, which reads the value from stdin):

   | Secret | Value |
   | --- | --- |
   | `DEPLOY_HOST` | The server's IP address (deploys then keep working even if DNS breaks) |
   | `DEPLOY_USER` | `deploy` |
   | `DEPLOY_SSH_KEY` | The whole content of the private key file `~/.ssh/gliagora-deploy` |
   | `DEPLOY_KNOWN_HOSTS` | The output of `ssh-keyscan -t ed25519 <server-ip>` run on your computer, with the same IP as `DEPLOY_HOST` |

   Check `DEPLOY_KNOWN_HOSTS` before saving it: on the server, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` shows the fingerprint, and `ssh-keygen -lf <(ssh-keyscan -t ed25519 <server-ip>)` on your computer must show the same one. The workflow refuses any other host key. If the IP changes, redo both secrets.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable** `DEPLOY_ENABLED` = `true`. This switches the workflow on. Set it to anything else to switch deploys off again. Then `DEPLOY_AUTO` (see "How deploys work"): `main` while the site is private, `tags` from M2 on.
3. Delete your local copy of the private key (`rm ~/.ssh/gliagora-deploy`). If the key is ever lost or exposed, make a new one, run `setup-server.sh` again with the new `DEPLOY_PUBLIC_KEY` (it replaces the old key) and update `DEPLOY_SSH_KEY`.

## 5. First deploy (once)

1. GitHub: **Actions → Deploy → Run workflow**, tag `main`. The log ends with "Deployed ghcr.io/…:sha-…".
2. Check https://gliagora.com/health/ (`{"status":"ok"}`, without a password) and https://gliagora.com/ (asks for the site-wide password, then redirects to `/en/`): the whole site stays private until M2 (D32, PLAN §18.2). Signed out, `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://gliagora.com/api/users/login/` must answer `401` (from Caddy, before the app).
   If the server has IPv6, check that Caddy sees the real address of IPv6 visitors (the form rate limit and the access log depend on it; `compose.prod.yml` enables IPv6 on the stack's network for this). From a computer with IPv6, run `curl -6 --resolve gliagora.com:443:[<server IPv6>] https://gliagora.com/health/`; then, on the server in `/opt/gliagora`, `docker compose -f compose.prod.yml exec caddy tail -n 1 /var/log/caddy/access.log` must show your own IPv6 address, masked to its first 48 bits, as `remote_ip`, not a `172.x` address.
3. Open https://gliagora.com/admin/, enter the site-wide password, and create the first editor account. The page must say "Create first user"; if it shows the sign-in form instead, an account exists that you did not make: stop, change the site-wide password (step 2), delete the database with `docker compose -f compose.prod.yml down` and `docker volume rm gliagora_db-data` (it holds nothing else yet), and deploy again. Then sign in, open Suggestions (empty for now), then a country (e.g. Türkiye), type a letter into its name and delete it again, and save: the admin's own requests to `/api` must work without asking for the site-wide password again (the browser reuses it).
4. On the server, take the first backup, test it and switch on the timers:

   ```sh
   cd /opt/gliagora/backup
   sudo ./backup.sh
   sudo ./restore.sh test
   sudo systemctl enable --now gliagora-backup.timer gliagora-restore-test.timer
   systemctl list-timers 'gliagora-*'
   ```

The app's scheduled jobs (`PAYLOAD_JOBS_AUTORUN` in `compose.prod.yml`) run from the first start: every minute the maintenance tick (the hourly expiry of listings, the retention purges; the outcome and acknowledgement emails wait for `SMTP_HOST`, M2), and every night at 03:30 UTC the check for a new ROR release, whose first run imports all institutions (about 15 minutes).

## 6. Update and roll back

CI pushes a new image for every merge to `main`, tagged `main` and `sha-` plus the first 7 characters of the commit (except a merge that changed only documentation, which runs no CI, D46). Until M2 it is deployed by itself once CI passes; from M2 on, push a release tag (see "How deploys work"). By hand, run the Deploy workflow with `main`, or with the `sha-` tag of a specific merge. `.env` then names the exact `sha-` tag that is running.

If the new image does not become healthy, the deploy switches back to the previous one by itself (see "How deploys work"). To go back to an older version on purpose, run the Deploy workflow with its `sha-` tag. On the server, without GitHub, `cd /opt/gliagora && cp .env.previous .env && sudo ./update.sh --no-pull` goes back to the image that ran before the last deploy; it is still on the server. Migrations are not undone automatically. If one damaged data, restore the `pre-update` snapshot (below).

## 7. Restore

```sh
cd /opt/gliagora/backup
sudo ./restore.sh list                          # snapshots with their IDs and times
sudo ./restore.sh test <snapshot-id>            # try it in a temporary container first
sudo ./restore.sh database <snapshot-id>        # replace the live database (asks first)
sudo ./restore.sh config latest /root/restored  # get the backed-up .env and settings back
```

`restore.sh database` takes a safety backup (tag `pre-restore`) of the current database, stops the app, recreates the database from the snapshot and starts the app again.

**What a restore keeps (M4b, D49).** A restore brings back everything deleted after the snapshot, so `restore.sh database` keeps two tables of the live database: the deletion log (record IDs of the deletions people asked for, or that the inactivity rule made, to be repeated on the restored data) and the data requests (what people asked, and what was done). Before replacing the database it copies their rows into a folder only root can read (`/root/gliagora-restore-carry.…`); after the restore it loads them back, where they replace older copies of the same rows, and in the same transaction moves the ID sequences of `deletion_log`, `data_requests`, `members`, `submissions` and `reports` past every ID it carried over or that the log names, so no new record takes a logged ID and no new request or log row collides with a carried one. It prints the rows and the next IDs, deletes the folder and starts the app. If carrying over fails, the app stays stopped and the folder stays: fix the cause (the message says what failed), then run `sudo ./restore.sh carry /root/gliagora-restore-carry.… [DB]`, which loads it and starts the app. The rows are also in the `pre-restore` snapshot the restore took first. If copying the rows out fails, nothing is dropped: the restore stops before it changes anything and starts the app again.

**A snapshot from before M4b** (any snapshot older than the deploy that added member accounts, such as that deploy's own `pre-update` snapshot) has no deletion log and no data requests. If the live tables had no rows either, the restore simply completes. If they had rows, the restore stops with the app stopped and keeps the folder: run `sudo ./restore.sh carry /root/gliagora-restore-carry.… [DB]` with an app image that includes M4b. It starts the app once, so that its migrations make the tables, stops it, loads the rows and starts the app again. If you went back to an image from before M4b (step 6), deploy M4b again first, and keep the folder until then. `restore.sh test` of such a snapshot reports the same case.

**Check it:** the monthly `restore.sh test` does the same carry-over from the live database into its temporary copy (it changes nothing live) and reports each table's rows and next ID, and that a new deletion-log row and a new request can be stored afterwards. Run it by hand after any change to the member or data-request tables: `sudo ./restore.sh test latest`. It removes its temporary container together with that container's data. Earlier versions of the script left that data behind, as an unnamed Docker volume holding a full copy of the restored database (since the S-day test, one per run). Remove those volumes once, with the operator's go-ahead: `docker volume ls -f dangling=true` lists them, `docker volume inspect <name>` shows when each was made, and `docker volume rm <name>` removes one (`docker volume prune -f` removes every unused unnamed volume at once; since Docker 23 it never touches named volumes such as `gliagora_db-data`). After a `restore.sh test`, `docker volume ls -f dangling=true` should list nothing new.

**New server after losing the old one:**

1. Run steps 1 and 2 (with a new deploy key if the old one is lost). Then redo step 4 for the new server: `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` always change (new IP, new host key), and `DEPLOY_SSH_KEY` if you made a new key.
2. Install the timer units as in step 3, without `backup.sh init`: `sudo cp systemd/gliagora-*.service systemd/gliagora-*.timer /etc/systemd/system/ && sudo systemctl daemon-reload`.
3. Copy the repository back to `/var/backups/gliagora/restic` (from your computer's copy or the second VDS). In `/opt/gliagora/backup`, create `backup.env` from `backup.env.example` and put the backup password from your password manager in `restic-password` (readable only by root).
4. Recover `.env` and `admin-auth.caddy` with `sudo ./restore.sh config latest /root/restored` and copy them to `/opt/gliagora` (mode 600).
5. Run the Deploy workflow with the last good `sha-` tag: it starts the stack with an empty database.
6. Restore the data with `sudo ./restore.sh database latest` (it replaces the empty database, with any account made in between), then switch on the timers (step 5). Until then the database has no editor account; the site-wide password keeps its first-account route closed.
7. Fetch the map's basemap again (step 8); it is not in the backups.

## 8. The map's basemap (M5; then about twice a year)

The map (PLAN §14) draws its background from a basemap on our own server: an extract of the Protomaps planet (OpenStreetMap data, ODbL) up to zoom 10, about 3.8 GB, with the fonts and sprites of its style. Caddy serves it at `/basemap/` from `/opt/gliagora/basemap/public`, behind the site-wide password until the map goes public at M6 (D39). Nothing about visitors reaches anyone: the server downloads the files once, and browsers get them from `gliagora.com`.

```sh
sudo /opt/gliagora/basemap/fetch-basemap.sh            # the newest Protomaps build (a few minutes)
sudo /opt/gliagora/basemap/fetch-basemap.sh 20260930   # or a given build (YYYYMMDD)
sudo /opt/gliagora/basemap/fetch-basemap.sh --rollback # back to the basemap before the last run
```

The script checks everything it downloads (the pmtiles tool by its checksum, the tiles with `pmtiles verify`, the fonts and sprites by a digest of their files, all pinned in the script) and changes `current.json`, the file the map reads first, only at the end. The map picks the new basemap up on its next load: no restart, no deploy. The basemap it replaces stays until the next run, for `--rollback`; older ones are deleted. It needs about 10 GB free while it runs. Without a basemap the map still works, with its pins on a plain background.

The basemap is not in the backups (`backup/backup.sh` names its files one by one), so it never reaches the weekly copy either: checked on 2026-10-01, the snapshots hold no basemap file and the whole repository is 19 MB.

Refresh it about twice a year (PLAN §14), and after moving to a new server. To update the fonts and sprites, change `ASSETS_COMMIT` and `ASSETS_DIGEST` in the script (and rebuild the test fixture with `tools/basemap/make-fixture.sh`).

## 9. Switching on member sign-in (M4b)

Member sign-in (D49) stays off on the server until its settings exist: `/en/sign-in/` says "Signing in is not available yet", and the app logs one line at start, `Member sign-in: email off, google off, orcid off`. Switch it on only with the operator's go-ahead, in this order:

1. **Copy the deploy files first.** Caddy must remove the query strings of the sign-in, account and data-request addresses from both of its logs (one-time links, Google's and ORCID's answers, where sign-in leads) before any sign-in key or `SMTP_HOST` is set. Backups must leave out sessions and email links, and a restore must keep the deletion log and the data requests (step 7). From your computer, in the repository:

   ```sh
   scp deploy/Caddyfile deploy/compose.prod.yml gliagora@<server-ip>:/opt/gliagora/
   scp deploy/backup/backup.sh deploy/backup/restore.sh gliagora@<server-ip>:/opt/gliagora/backup/
   ```

   On the server: `cd /opt/gliagora && sudo ./update.sh --no-pull` (it backs up first and applies `compose.prod.yml`), then restart Caddy so that it reads the new Caddyfile: `docker compose -f compose.prod.yml restart caddy` (`update.sh` does not restart Caddy when only the Caddyfile changed). Then check that Caddy took the new file: `docker compose -f compose.prod.yml logs --tail 20 caddy` shows no error, and a request to `https://gliagora.com/en/sign-in/?next=check` (with the site-wide password) appears in `sudo tail -n 1 /var/lib/docker/volumes/gliagora_caddy-logs/_data/access.log` as `/en/sign-in/?[removed]`.
2. **Then set the keys** in `/opt/gliagora/.env` (`deploy/.env.example` lists them): `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `ORCID_CLIENT_ID` and `ORCID_CLIENT_SECRET` (ORCID's own issuer; its sandbox is refused here), and, for sign-in by email link, the M2 `SMTP_*` settings (the link form also needs `ALTCHA_HMAC_KEY`, which is set). Each way of signing in switches on by itself once its settings are there; none needs a new secret.
3. **Restart the app** (`sudo ./update.sh --no-pull`) and check its start line: `docker compose -f compose.prod.yml logs app | grep 'Member sign-in'`. A line naming a setting that switched a way off says which one; it never shows a value.

## 10. Finding a data request from an address (M4b)

The data-request form (`/en/legal/data-requests/`) works once the M2 `SMTP_*` settings are set, like email sign-in (until then it says that it is temporarily unavailable and gives privacy@gliagora.com). A request sent with it is recorded at once, but until the person confirms it with the link in our email, its record holds no address: only its kind, the date and a code made from the address (`emailHash`, an HMAC with a key derived from `PAYLOAD_SECRET`, `src/lib/data-requests/address.ts`). Unconfirmed records are deleted after 60 days. If someone writes to privacy@ that they sent a request (for example, the link expired), work out the code from the address they give, on the server:

```sh
cd /opt/gliagora
docker compose -f compose.prod.yml exec -T app node -e 'const c=require("node:crypto");let a="";process.stdin.on("data",(d)=>(a+=d)).on("end",()=>{const k=Buffer.from(c.hkdfSync("sha256",process.env.PAYLOAD_SECRET,"","gliagora/data-requests/address/v1",32));console.log(c.createHmac("sha256",k).update(a.trim().normalize("NFC").toLowerCase()).digest("hex"))})'
```

Then type the address, press Enter and then Ctrl-D: the command prints the code (64 characters). The address is read from what you type, so it is in no shell history, command line or log, and the secret never leaves the container. Capitals do not matter, but every other character does (`name+news@` is another address than `name@`). In the admin, open "Data requests", add the filter "Address code" equals the code (or open `/admin/collections/data-requests?where[emailHash][equals]=<code>`): the list shows the requests sent from that address, with their kind, status and date. Requests the person confirmed also hold the address itself (filter "Email"). An unconfirmed record takes no note and no "What was done" (the admin shows both read-only and the database refuses them), so it never holds the address: answer the person by email, and if their email is itself a request, record it as a new request from that email.

## Checking from outside

Check the site from another computer with single requests (`curl`, a browser). Do not scan the server's ports at full speed from your own connection: during S, a scan of all 65,535 ports made the provider's network block that IPv4 address for about 20 minutes (IPv6 kept working). If you must, scan slowly or from elsewhere.

## Useful commands

```sh
docker compose -f compose.prod.yml ps               # status and health
docker compose -f compose.prod.yml logs -f app      # app logs
docker compose -f compose.prod.yml restart caddy    # after editing the Caddyfile or admin-auth.caddy
sudo ufw status verbose                             # firewall
sudo fail2ban-client status sshd                    # blocked SSH addresses
sudo journalctl -t sudo | grep deploy-remote        # every deploy the deploy user started
```

## Decided during the server setup (S, D42)

- **Staging:** none while the site is private; production, behind the site-wide password, doubles as staging. A separate staging is reconsidered before the site goes public.
- **Automatic rollback:** built into `deploy-remote.sh` (see "How deploys work").
- **Rate limits in Caddy** (for the auth routes and `/en/search/`; they need a plugin and a custom Caddy build): on the pre-launch checklist (PLAN §20). Until then, the site-wide password guards `/admin` and `/api` (so also Payload's sign-in, password-reset and first-account routes), Payload locks an account for 15 minutes after 5 failed sign-ins and sends at most one reset email per account every 15 minutes, the public forms have their own rate limits, and search runs at most two institution searches at a time, each for at most 2 seconds.
- **Backup alerts** (success and failure emails): at M2, with the mailbox.
- **Deploy secrets:** repository secrets (step 4), a deploy user that is not an admin, and the pinned host key.
- **Admin sudo:** without a password (see "Who logs in").

listmonk (M2) and Umami each get their own database and user in the same PostgreSQL later.
