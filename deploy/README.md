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
| `compose.prod.yml` | The stack: Caddy, the app, PostgreSQL 18, listmonk (the newsletter, M2); every container logs to the system journal |
| `Caddyfile` | HTTPS, security headers, the site-wide password (until M2 the whole site except `/health/`; always `/admin` and `/api`), masked logs (the access log and Caddy's own log) |
| `admin-auth.caddy.example` | Template for the site-wide password |
| `postgres/init/10-app-database.sh` | Creates the app's own database user on first start |
| `postgres/init/20-listmonk-database.sh` | Creates listmonk's database user and database (on first start, and on every update through `listmonk/prepare.sh`) |
| `listmonk/prepare.sh`, `listmonk/settings.sql` | listmonk's install and its settings from this folder, run by `update.sh` (section 11) |
| `.env.example` | Template for the server's `.env` (domain, image, secrets) |
| `update.sh` | Backup, then prepare listmonk, restart with the new image and wait until healthy |
| `deploy-remote.sh` | Server side of the GitHub Deploy workflow (the only command its SSH key may run), with the automatic rollback |
| `backup/backup.sh` | Encrypted backup of the databases and settings (restic) |
| `backup/restore.sh` | Restore, list snapshots, or test a restore without touching production |
| `backup/alert.sh` | Emails the result of a backup or restore test (from M2, once SMTP is set) |
| `backup/systemd/` | Timers: nightly backup, monthly restore test |
| `logs/90-gliagora.conf`, `logs/install-journald.sh` | The system journal keeps 14 days (D34), without a copy in `/var/log/syslog` |
| `basemap/fetch-basemap.sh` | Puts the map's basemap (tiles, fonts, sprites) on the server; run about twice a year (step 8) |

On the server, everything lives in `/opt/gliagora`:

| Path | Contents |
| --- | --- |
| `/opt/gliagora/.env` | Secrets and the deployed image `APP_IMAGE` (mode 600, never committed) |
| `/opt/gliagora/.env.previous` | `.env` before the last deploy, for the rollback |
| `/opt/gliagora/admin-auth.caddy` | Hash of the site-wide password (mode 600, never committed) |
| `/root/site-password` | The site-wide password itself, readable only by root, until you have saved it in your password manager |
| `/root/listmonk-admin-password` | The password of listmonk's admin (user `gliagora-admin`), readable only by root (section 11) |
| Docker volume `gliagora_db-data` | The database |
| Docker volume `gliagora_caddy-data` | TLS certificates |
| Docker volume `gliagora_caddy-logs` | Access logs with masked IPs, kept 14 days |
| `/opt/gliagora/backup/` | Backup scripts, `backup.env` (mode 600) and `restic-password` (readable only by root) |
| `/var/backups/gliagora/restic` | Encrypted backup repository |
| `/opt/gliagora/basemap/public` | The map's basemap, served by Caddy at `/basemap/` (step 8); not backed up, fetched again |
| The system journal (`/var/log/journal`) | The containers' logs (`docker compose -f compose.prod.yml logs`), sudo, SSH and the backup units: 14 days, at most 1 GB (`/etc/systemd/journald.conf.d/90-gliagora.conf`) |

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
2. It sends the job's own `GITHUB_TOKEN` (valid only while the job runs) on stdin. `deploy-remote.sh` accepts only `deploy main` or `deploy sha-<7 characters>`, logs in to GHCR with the token in a temporary Docker config, pulls the app's image (only that one, so a hiccup of another registry cannot stop a deploy; a missing public image, such as a new listmonk, is pulled when it is first needed) and deletes that config. **No registry login is stored on the server.**
3. It pins the image to the commit it was built from (`main` becomes `sha-<commit>`), records it in `.env` (the old file stays as `.env.previous`) and runs `update.sh --no-pull`:
   - a `pre-update` backup (the database is started first if it was stopped), skipped only on the very first start, when there is no database volume yet;
   - listmonk's preparation (`listmonk/prepare.sh`, section 11): its database, its install and its settings from this folder. If it fails, listmonk is left as it is and the rest is updated without it (nothing depends on listmonk);
   - a restart;
   - a wait (at most 5 minutes) until every service with a health check is healthy (Caddy has none: running is enough). The app applies database migrations when it starts.
4. If that fails before the app was restarted (for example, the backup fails), the app keeps running the previous image and `APP_IMAGE` in `.env` goes back to it. **If the new image started but did not become healthy, the script switches back to the previous image by itself** (it is still on the server) and waits for it (D42). The workflow then fails with "Rolled back to …", so you see it. Database migrations are not undone; if the new version's migrations broke something, restore the `pre-update` snapshot (step 7). If the new image is healthy but another service is not (listmonk, say), it does not roll back, since that would not help: the workflow fails with "… is deployed and healthy, but listmonk is not" (or "… but listmonk could not be prepared", when `prepare.sh` failed), and `docker compose -f compose.prod.yml logs listmonk` (or the deploy's log) shows why. Going back changes only the `APP_IMAGE` line of `.env`, never the rest: a setting added since the last deploy stays.

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
scp -r deploy/setup-server.sh deploy/logs root@<server-ip>:/root/
ssh root@<server-ip> "ADMIN_USER=gliagora DEPLOY_PUBLIC_KEY='$(cat ~/.ssh/gliagora-deploy.pub)' bash /root/setup-server.sh"
```

The script:

- installs updates and turns on automatic security updates (with a reboot at 01:30 UTC when an update needs one);
- copies root's SSH keys to the new admin user `gliagora`, who uses `sudo` without a password (D42);
- turns off root and password logins (`/etc/ssh/sshd_config.d/00-gliagora.conf`, read before the provider's files, so its values win) and lets only `gliagora` and `deploy` log in;
- opens only 22 (rate-limited), 80 and 443 in the firewall, and starts fail2ban;
- keeps the system journal, where the containers log, 14 days, without a copy in `/var/log/syslog` (`logs/install-journald.sh`, D34);
- installs Docker, with the network's MTU where the server's network is smaller than 1500;
- creates the user `deploy` with the deploy key, restricted to `deploy-remote.sh`, and its one sudo rule.

**Before closing that session**, check in a second terminal that `ssh gliagora@<server-ip>` works and that `sudo -n true && echo ok` prints `ok`. If `/var/run/reboot-required` exists afterwards, reboot once (`sudo reboot`) before continuing.

## 2. Prepare the stack (once)

From your computer:

```sh
scp -r deploy/compose.prod.yml deploy/Caddyfile deploy/postgres deploy/.env.example \
  deploy/admin-auth.caddy.example deploy/update.sh deploy/deploy-remote.sh deploy/backup deploy/basemap \
  deploy/listmonk deploy/logs gliagora@<server-ip>:/opt/gliagora/
```

On the server, in `/opt/gliagora`, create `.env` with six new secrets (listmonk's two since M2). They are generated on the server and never shown; nobody needs to know them:

```sh
cd /opt/gliagora
umask 077
while IFS= read -r line; do
  case "$line" in
    POSTGRES_PASSWORD=* | APP_DB_PASSWORD=* | PAYLOAD_SECRET=* | ALTCHA_HMAC_KEY=* | LISTMONK_DB_PASSWORD=* | LISTMONK_API_TOKEN=*)
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

Leave the `SMTP_*` settings empty until the Turkish mailbox is set up at M2 (its SMTP server sends the email; PLAN §11.7.1, D22): until then the app sends no email (the outcome of suggestions, the acknowledgement of reports) and writes no address to its logs. Admin password resets do not arrive either; reset a password by hand. Setting `SMTP_HOST` also switches on member sign-in by email link (its form also needs `ALTCHA_HMAC_KEY`, which is set), so before setting it, copy the deploy files, restart Caddy and check its logs as in step 1 of "Switching on member sign-in" (section 9). When you set them, write `SMTP_PASS` and `EMAIL_FROM` in single quotes (`SMTP_PASS='…'`, `EMAIL_FROM='Gliagora <hello@gliagora.com>'`): Docker Compose then gives the app exactly what is written, and `listmonk/prepare.sh` and `backup/alert.sh`, which read `.env` themselves, refuse a value with `$`, `\`, `"` or `#` outside single quotes (naming the setting, never its value) rather than read it differently from Compose. A mailbox password that contains `'` cannot be written so: change the password.

Do not start the stack by hand: the first deploy (step 5) pulls the images and starts it.

## 3. Prepare backups (once)

Backups are encrypted with restic (PLAN §11.7.1, §18.2). Each night at 00:30 UTC (03:30 in Istanbul):

- each database (`DATABASES` in `backup.env`: the app's `gliagora` and, since M2, `listmonk`) is dumped and streamed into the encrypted repository, together with `.env`, `admin-auth.caddy`, the Compose files and the set-up scripts of `postgres/` and `listmonk/`. The rows of `form_limits` (hashed IP addresses for the form rate limits, kept 24 hours in the app database only, D34), `member_sessions` and `email_tokens` (members' sessions and email links, D49), and listmonk's admin sessions are left out; after a restore the limits start empty, everyone is signed out and no email link works. A database the server has but `DATABASES` does not name makes the backup fail (after storing the others), so none is left out by mistake; so does one that `DATABASES` names and that was backed up before but is gone from the server (restore it, step 7). One that has never been backed up (listmonk before its first start) is skipped, and so is any missing one in the safety backup before a restore;
- everything from the last 2 days is kept, plus 7 daily, 4 weekly and 6 monthly snapshots. Backups taken before updates and restores never delete anything themselves;
- on Sundays the repository is checked for damage.

On the 1st of each month the latest backup of each database is restored into a temporary container of its own, with no network, and checked.

On the server, in `/opt/gliagora/backup`, create the settings and the **backup password** (in a file only root can read):

```sh
cd /opt/gliagora/backup
cp backup.env.example backup.env && chmod 600 backup.env    # then set ALERT_EMAIL in it (below)
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

**Checking backups:** `cat /var/backups/gliagora/last-success` shows the time of the last good backup; `journalctl -u gliagora-backup` shows the logs (14 days).

**Backup emails** (`backup/alert.sh`, D42). After every run of the backup and of the restore test, systemd runs `alert.sh` (`ExecStopPost` in both units). It emails every failure, and the success of the Sunday backup (the one that checks the repository) and of the monthly restore test, so you hear from the backups at least once a week: **a week without one means something is wrong.** The email holds the unit, its result and the run's own log lines (database names, snapshot IDs, counts; never what a database holds). It goes to `ALERT_EMAIL` in `backup.env`, through the app's mail server (`SMTP_*` in `.env`; STARTTLS required on port 587, TLS from the start with `SMTP_SECURE=true`). With either missing it sends nothing and logs "alerts off": so until M2's mailbox, check `last-success` now and then. Once both are set, try it: `sudo SERVICE_RESULT=exit-code /opt/gliagora/backup/alert.sh gliagora-backup` sends a "backup failed" email for the last run.

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
   sudo ./restore.sh test            # every database in DATABASES, each in its own container
   sudo systemctl enable --now gliagora-backup.timer gliagora-restore-test.timer
   systemctl list-timers 'gliagora-*'
   ```

The app's scheduled jobs (`PAYLOAD_JOBS_AUTORUN` in `compose.prod.yml`) run from the first start: every minute the maintenance tick (the hourly expiry of listings, the retention purges; the outcome and acknowledgement emails wait for `SMTP_HOST`, M2), and every night at 03:30 UTC the check for a new ROR release, whose first run imports all institutions (about 15 minutes).

## 6. Update and roll back

CI pushes a new image for every merge to `main`, tagged `main` and `sha-` plus the first 7 characters of the commit (except a merge that changed only documentation, which runs no CI, D46). Until M2 it is deployed by itself once CI passes; from M2 on, push a release tag (see "How deploys work"). By hand, run the Deploy workflow with `main`, or with the `sha-` tag of a specific merge. `.env` then names the exact `sha-` tag that is running.

If the new image does not become healthy, the deploy switches back to the previous one by itself (see "How deploys work"). To go back to an older version on purpose, run the Deploy workflow with its `sha-` tag. On the server, without GitHub, this goes back to the image that ran before the last deploy (it is still on the server), changing only the `APP_IMAGE` line of `.env` (never copy all of `.env.previous` back: a setting added since, such as a new secret, would be lost):

```sh
cd /opt/gliagora
previous=$(grep -m1 '^APP_IMAGE=' .env.previous | cut -d= -f2-)
sudo sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$previous|" .env && sudo ./update.sh --no-pull
```

Migrations are not undone automatically. If one damaged data, restore the `pre-update` snapshot (below).

## 7. Restore

```sh
cd /opt/gliagora/backup
sudo ./restore.sh list                          # snapshots with their IDs, times and tags (db:gliagora, db:listmonk)
sudo ./restore.sh test <snapshot-id>            # try it in a temporary container first
sudo ./restore.sh database <snapshot-id>        # replace the live database it holds (asks first)
sudo ./restore.sh config latest /root/restored  # get the backed-up .env and settings back
```

`restore.sh database` takes a safety backup (tag `pre-restore`) of the current databases, stops the service that uses the database (the app for `gliagora`, listmonk for `listmonk`), recreates the database from the snapshot and starts the service again. For listmonk it first applies the current settings and API user again (`listmonk/prepare.sh`): the snapshot holds them as they were then. `prepare.sh` also upgrades the restored database to the listmonk image `compose.prod.yml` names (to go back to an older listmonk, see section 11).

**Restore both databases from the same night** (each night stores one snapshot of each; `restore.sh list` shows them side by side), by their IDs. Every `restore.sh database` first stores the current databases (tag `pre-restore`), so the newest snapshot changes after each restore: `database latest` passes over those `pre-restore` snapshots (it takes the newest `nightly`, `pre-update` or manual one), while `test latest` checks the newest of all. A restore of listmonk's database alone loses the signups confirmed after its snapshot (their addresses are nowhere else) and brings back the subscribers removed since. Once the newsletter signup and the members' sync are built (M2, D50), the app removes again, within 10 minutes, those whose removal it logged (the deletion log), and its nightly check of members' subscriptions puts members' choices back.

**What a restore keeps (M4b, D49).** A restore brings back everything deleted after the snapshot, so `restore.sh database` keeps two tables of the live database: the deletion log (record IDs of the deletions people asked for, or that the inactivity rule made, to be repeated on the restored data) and the data requests (what people asked, and what was done). Before replacing the database it copies their rows into a folder only root can read (`/root/gliagora-restore-carry.…`); after the restore it loads them back, where they replace older copies of the same rows, and in the same transaction moves the ID sequences of `deletion_log`, `data_requests`, `members`, `submissions` and `reports` past every ID it carried over or that the log names, so no new record takes a logged ID and no new request or log row collides with a carried one. It prints the rows and the next IDs, deletes the folder and starts the app. If carrying over fails, the app stays stopped and the folder stays: fix the cause (the message says what failed), then run `sudo ./restore.sh carry /root/gliagora-restore-carry.… [DB]`, which loads it and starts the app. The rows are also in the `pre-restore` snapshot the restore took first. If copying the rows out fails, nothing is dropped: the restore stops before it changes anything and starts the app again.

**A snapshot from before M4b** (any snapshot older than the deploy that added member accounts, such as that deploy's own `pre-update` snapshot) has no deletion log and no data requests. If the live tables had no rows either, the restore simply completes. If they had rows, the restore stops with the app stopped and keeps the folder: run `sudo ./restore.sh carry /root/gliagora-restore-carry.… [DB]` with an app image that includes M4b. It starts the app once, so that its migrations make the tables, stops it, loads the rows and starts the app again. If you went back to an image from before M4b (step 6), deploy M4b again first, and keep the folder until then. `restore.sh test` of such a snapshot reports the same case.

**Check it:** the monthly `restore.sh test` restores the latest snapshot of each database into a temporary container of its own and checks that it has tables and its record of migrations (the app's `payload_migrations`, listmonk's `migrations` setting). For the app's database it also does the same carry-over from the live database into its temporary copy (it changes nothing live) and reports each table's rows and next ID, and that a new deletion-log row and a new request can be stored afterwards. Run it by hand after any change to the member or data-request tables: `sudo ./restore.sh test latest` (all databases) or `sudo ./restore.sh test latest gliagora` (one). It removes its temporary container together with that container's data. Earlier versions of the script left that data behind, as an unnamed Docker volume holding a full copy of the restored database (since the S-day test, one per run). Remove those volumes once, with the operator's go-ahead: `docker volume ls -f dangling=true` lists them, `docker volume inspect <name>` shows when each was made, and `docker volume rm <name>` removes one (`docker volume prune -f` removes every unused unnamed volume at once; since Docker 23 it never touches named volumes such as `gliagora_db-data`). After a `restore.sh test`, `docker volume ls -f dangling=true` should list nothing new.

**New server after losing the old one:**

1. Run steps 1 and 2 (with a new deploy key if the old one is lost). Then redo step 4 for the new server: `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` always change (new IP, new host key), and `DEPLOY_SSH_KEY` if you made a new key.
2. Install the timer units as in step 3, without `backup.sh init`: `sudo cp systemd/gliagora-*.service systemd/gliagora-*.timer /etc/systemd/system/ && sudo systemctl daemon-reload`.
3. Copy the repository back to `/var/backups/gliagora/restic` (from your computer's copy or the second VDS). In `/opt/gliagora/backup`, create `backup.env` from `backup.env.example` and put the backup password from your password manager in `restic-password` (readable only by root).
4. Recover `.env` and `admin-auth.caddy` with `sudo ./restore.sh config latest /root/restored` and copy them to `/opt/gliagora` (mode 600).
5. Run the Deploy workflow with the last good `sha-` tag: it starts the stack with an empty database.
6. Restore the data, both databases from the same backup run of the old server: `sudo ./restore.sh list` first, and note the ID of the newest `db:gliagora` snapshot and of the `db:listmonk` snapshot taken in the same run (the same night, a few seconds apart; normally the last `nightly`, or a later `pre-update` of the old server). Then `sudo ./restore.sh database <gliagora-ID>` and `sudo ./restore.sh database <listmonk-ID>` (they replace the empty databases, with any account made in between), and switch on the timers (step 5). Use the IDs rather than `latest`: each restore first stores the new server's databases (tag `pre-restore`), so the newest snapshot changes with every restore (`database latest` passes over `pre-restore` snapshots, but the IDs leave no doubt). Until then the database has no editor account; the site-wide password keeps its first-account route closed. listmonk's admin password is the one in your password manager: delete the `/root/listmonk-admin-password` that the new server's first start made for its empty database (`sudo rm /root/listmonk-admin-password`).
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

Member sign-in (D49) stays off on the server until its settings exist: `/en/sign-in/` says "Signing in is not available yet", and the app logs one line at start, `Member sign-in: email off, google off, orcid off`.

**First, register the Google and ORCID clients** (the operator, once; nothing on the server changes). Copy each client ID and secret straight into `/opt/gliagora/.env` in step 2 below, never into a chat, an email or a file in the repository.

- **Google** (console.cloud.google.com):
  - Create a project "gliagora", then Google Auth Platform → Get started: app name "Gliagora"; a user support email (better a group address the operator controls than a personal one, since users see it); Audience "External"; a developer contact email.
  - Branding: home page `https://gliagora.com/en/`, privacy policy `https://gliagora.com/en/legal/privacy/`, terms of service `https://gliagora.com/en/legal/terms/`, authorised domain `gliagora.com`; no logo (a logo makes Google verify the brand first).
  - Data access: the scopes `openid` and `…/auth/userinfo.email` only.
  - Audience: keep the publishing status "Testing", with the operator's Google accounts as test users, until the M6 launch; publish it ("In production") then, once the privacy and terms pages are public (verify the domain in Google Search Console if Google asks).
  - Clients → Create client → "Web application": authorised redirect URI `https://gliagora.com/en/sign-in/google/callback/`, no JavaScript origins. This gives `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **ORCID** (orcid.org → sign in → Developer tools): register for the free Public API (non-commercial use): name "Gliagora", website `https://gliagora.com`, a short description, redirect URI `https://gliagora.com/en/sign-in/orcid/callback/`. This gives `ORCID_CLIENT_ID` (`APP-…`) and `ORCID_CLIENT_SECRET`; the site asks for the `openid` scope itself. The first ORCID sign-in after step 3 (the operator's, behind the site-wide password) is a gate: it works only if ORCID returns the nonce and accepts the token request without PKCE. Otherwise the app's log names `OAUTH_JWT_CLAIM_COMPARISON_FAILED` or the token error, and ORCID cannot be used until that changes (PLAN §20, pre-launch checklist).

Then switch sign-in on, only with the operator's go-ahead, in this order:

1. **Copy the deploy files first.** Caddy must remove the query strings of the sign-in, account and data-request addresses from both of its logs (one-time links, Google's and ORCID's answers, where sign-in leads) before any sign-in key or `SMTP_HOST` is set. Backups must leave out sessions and email links, and a restore must keep the deletion log and the data requests (step 7). From your computer, in the repository:

   ```sh
   scp deploy/Caddyfile deploy/compose.prod.yml gliagora@<server-ip>:/opt/gliagora/
   scp deploy/backup/backup.sh deploy/backup/restore.sh gliagora@<server-ip>:/opt/gliagora/backup/
   ```

   Since M2's server parts, `compose.prod.yml` also needs listmonk's settings, folder and scripts: if the server does not have them yet, follow section 12 instead, which copies everything.

   On the server: `cd /opt/gliagora && sudo ./update.sh --no-pull` (it backs up first and applies `compose.prod.yml`), then restart Caddy so that it reads the new Caddyfile: `docker compose -f compose.prod.yml restart caddy` (`update.sh` does not restart Caddy when only the Caddyfile changed). Then check that Caddy took the new file: `docker compose -f compose.prod.yml logs --tail 20 caddy` shows no error, and a request to `https://gliagora.com/en/sign-in/?next=check` (with the site-wide password) appears in `sudo tail -n 1 /var/lib/docker/volumes/gliagora_caddy-logs/_data/access.log` as `/en/sign-in/?[removed]`.
2. **Then set the keys** in `/opt/gliagora/.env` (`deploy/.env.example` lists them): `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `ORCID_CLIENT_ID` and `ORCID_CLIENT_SECRET` (ORCID's own issuer; its sandbox is refused here), and, for sign-in by email link, the M2 `SMTP_*` settings (`SMTP_PASS` and `EMAIL_FROM` in single quotes, step 2; the link form also needs `ALTCHA_HMAC_KEY`, which is set). Each way of signing in switches on by itself once its settings are there; none needs a new secret.
3. **Restart the app** (`sudo ./update.sh --no-pull`) and check its start line: `docker compose -f compose.prod.yml logs app | grep 'Member sign-in'`. A line naming a setting that switched a way off says which one; it never shows a value.

## 10. Finding a data request from an address (M4b)

The data-request form (`/en/legal/data-requests/`) works once the M2 `SMTP_*` settings are set, like email sign-in (until then it says that it is temporarily unavailable and gives privacy@gliagora.com). A request sent with it is recorded at once, but until the person confirms it with the link in our email, its record holds no address: only its kind, the date and a code made from the address (`emailHash`, an HMAC with a key derived from `PAYLOAD_SECRET`, `src/lib/data-requests/address.ts`). Unconfirmed records are deleted after 60 days. If someone writes to privacy@ that they sent a request (for example, the link expired), work out the code from the address they give, on the server:

```sh
cd /opt/gliagora
docker compose -f compose.prod.yml exec -T app node -e 'const c=require("node:crypto");let a="";process.stdin.on("data",(d)=>(a+=d)).on("end",()=>{const k=Buffer.from(c.hkdfSync("sha256",process.env.PAYLOAD_SECRET,"","gliagora/data-requests/address/v1",32));console.log(c.createHmac("sha256",k).update(a.trim().normalize("NFC").toLowerCase()).digest("hex"))})'
```

Then type the address, press Enter and then Ctrl-D: the command prints the code (64 characters). The address is read from what you type, so it is in no shell history, command line or log, and the secret never leaves the container. Capitals do not matter, but every other character does (`name+news@` is another address than `name@`). In the admin, open "Data requests", add the filter "Address code" equals the code (or open `/admin/collections/data-requests?where[emailHash][equals]=<code>`): the list shows the requests sent from that address, with their kind, status and date. Requests the person confirmed also hold the address itself (filter "Email"). An unconfirmed record takes no note and no "What was done" (the admin shows both read-only and the database refuses them), so it never holds the address: answer the person by email, and if their email is itself a request, record it as a new request from that email.

## 11. listmonk, the newsletter service (M2)

[listmonk](https://listmonk.app) (AGPL-3.0, unmodified, the image pinned by digest in `compose.prod.yml`) holds the confirmed subscribers of Glia Notes and will send its issues (M6, M11). It runs beside the app, with its own database `listmonk` and database user in the same PostgreSQL (one database user per app, PLAN §18.2), and is reachable **only inside the server**: the app talks to it at `http://listmonk:9000` on the stack's own network, and its admin is published on the server's loopback only (`127.0.0.1:9000`). Caddy never routes to it and it has no subdomain, so none of its own public pages (subscription, archive) can be reached from outside. Nothing depends on it: if it is down, the site and its deploys keep working (a deploy whose app is healthy is not rolled back because of listmonk). Its logs: `docker compose -f compose.prod.yml logs listmonk`.

**Its admin, through an SSH tunnel.** On your computer:

```sh
ssh -N -L 9001:127.0.0.1:9000 gliagora@<server-ip>
```

then open http://localhost:9001/admin/ and sign in as `gliagora-admin`. The tunnel carries the page through SSH, so nothing of it crosses the internet unencrypted, and only someone who can log in to the server can reach it. Stop it with Ctrl-C. (Local port 9001, so that it never collides with a local listmonk on 9000; listmonk's own links in its admin use that address, `app.root_url`.)

**The admin password** is generated once, on the server, into a file only root can read (D42), like the site-wide password. Show it in your own terminal, to save it in your password manager: `ssh -t gliagora@<server-ip> sudo cat /root/listmonk-admin-password`. Once saved, you may delete the file (`sudo rm /root/listmonk-admin-password`). Change it in listmonk's admin (Users) if it is ever exposed.

**What `listmonk/prepare.sh` does.** `update.sh` runs it on every update and deploy, after the backup and before the stack starts; it is idempotent and prints no secret. It:

1. creates listmonk's database user and database if they are missing, and sets the user's password from `LISTMONK_DB_PASSWORD` in `.env` (`postgres/init/20-listmonk-database.sh`, which also runs by itself on a new, empty database volume);
2. installs listmonk once, with the admin `gliagora-admin`: it generates `/root/listmonk-admin-password` if it is missing and the database is not installed yet, and gives the password to the one-off install on stdin (never in a command line or a container's settings), so listmonk never offers its first account to "the first visitor". Then it brings listmonk's schema up to date (`--upgrade`);
3. applies `listmonk/settings.sql`: it removes the install's samples, keeps the private list **Glia Notes** (single opt-in: the site runs the double opt-in itself, so listmonk only ever holds confirmed subscribers), the app's API user `gliagora-app` (it may only find, by ID or by address, add, change and delete subscribers of Glia Notes; never give it listmonk's `subscribers:sql_query` permission, whose SQL expressions listmonk cannot keep to its subscriber tables; its token is `LISTMONK_API_TOKEN` in `.env`, of which listmonk keeps only the SHA-256) and the settings: no update check, no public pages of its own, no tracking, no recorded IP addresses, none of its own unsubscribe headers (the site sends its own), no captcha services, no bounce processing yet, and the mail server from the app's `SMTP_*` settings (off while `SMTP_HOST` is empty, so until M2 listmonk cannot send);
4. starts listmonk again if it was running and anything changed (it reads its settings only when it starts), recreated on the image `compose.prod.yml` names. When that image is a new one (an upgrade), step 2 first stops the running listmonk, so that the old program never works on a database the new one is migrating.

If `prepare.sh` fails during an update (listmonk's database, its upgrade or a refused setting; the message says which), `update.sh` leaves listmonk as it is (stopped, if it was stopped for an upgrade), starts everything else and ends with an error that names listmonk; a deploy then does not roll the app back. Fix the cause, then run `sudo ./listmonk/prepare.sh` and `docker compose -f compose.prod.yml up -d listmonk`, or `sudo ./update.sh --no-pull`.

**Changing a setting.** Change `listmonk/settings.sql` in the repository (one pull request, which runs CI with a real listmonk), copy it to `/opt/gliagora/listmonk/` and run `sudo ./update.sh --no-pull` (or `sudo ./listmonk/prepare.sh`). A setting changed only in listmonk's admin is undone at the next update when `settings.sql` manages it, and kept when it does not (campaign templates, for instance). Settings that need a secret come from `.env`.

**Upgrading listmonk.** Change the image in `compose.prod.yml` and `compose.yaml` (the tag and its digest, from the tag's page on Docker Hub or `docker buildx imagetools inspect listmonk/listmonk:<version>`; a unit test checks that both name the same), read its release notes for changes to the settings or the API, run the tests (`pnpm test:db` with a real listmonk) and merge; then copy `compose.prod.yml` to the server and run `sudo ./update.sh --no-pull`: it backs up first, `prepare.sh` stops the old listmonk, applies the new version's database migrations and the settings, and starts the new listmonk.

**Going back to an older listmonk.** Its migrations are not undone, and both `restore.sh` (through `prepare.sh`) and listmonk's own start upgrade a database to the image `compose.prod.yml` names: restoring before the image is changed back would bring the same new version back at once. So, in this order:

1. Revert the listmonk image (tag and digest) in `compose.prod.yml` and `compose.yaml`, in a pull request.
2. Copy that `compose.prod.yml` to `/opt/gliagora/` (no `update.sh` yet).
3. `sudo ./restore.sh list` in `/opt/gliagora/backup`: pick the `pre-update` snapshot tagged `db:listmonk` of that upgrade (later deploys make `pre-update` snapshots too, so the newest may be the wrong one).
4. `sudo ./restore.sh database <that ID> listmonk`: it restores the database, applies the settings with the older image and starts it. Signups confirmed since the upgrade are lost (they are in the `pre-restore` snapshot the restore takes first).

## 12. Putting M2's server parts on the running server (once)

On a new server, steps 1–5 already do all of this. On the server running since S, in this order, with the operator's go-ahead (CLAUDE.md, rule a), and never printing a secret:

1. **Generate the two new secrets in `.env`** (before the new `compose.prod.yml` arrives, which refuses to start without them), without showing them:

   ```sh
   cd /opt/gliagora
   for name in LISTMONK_DB_PASSWORD LISTMONK_API_TOKEN; do
     sudo grep -q "^$name=" .env || printf '%s=%s\n' "$name" "$(openssl rand -hex 32)" | sudo tee -a .env >/dev/null
   done
   sudo grep -c '^LISTMONK_' .env    # 2
   ```

2. **Edit `backup/backup.env`**: `DATABASES="gliagora listmonk"`, and add `ALERT_EMAIL=` (empty until M2's mailbox; then the operator's address):

   ```sh
   sudo sed -i 's/^DATABASES=.*/DATABASES="gliagora listmonk"/' backup/backup.env
   sudo grep -q '^ALERT_EMAIL=' backup/backup.env || echo 'ALERT_EMAIL=' | sudo tee -a backup/backup.env >/dev/null
   ```

3. **Copy the files**, from your computer, in the repository:

   ```sh
   scp -r deploy/compose.prod.yml deploy/update.sh deploy/deploy-remote.sh deploy/postgres deploy/listmonk \
     deploy/logs gliagora@<server-ip>:/opt/gliagora/
   scp deploy/backup/backup.sh deploy/backup/restore.sh deploy/backup/alert.sh deploy/backup/backup.env.example \
     gliagora@<server-ip>:/opt/gliagora/backup/
   scp deploy/backup/systemd/* gliagora@<server-ip>:/opt/gliagora/backup/systemd/
   ```

4. **Install the journal's limit and the units' alert lines**, on the server: `sudo /opt/gliagora/logs/install-journald.sh`, then `sudo cp /opt/gliagora/backup/systemd/gliagora-*.service /opt/gliagora/backup/systemd/gliagora-*.timer /etc/systemd/system/ && sudo systemctl daemon-reload`.
5. **Apply it:** `cd /opt/gliagora && sudo ./update.sh --no-pull`. It recreates the database container (its new setting and log driver), backs up, prepares listmonk (creates its database, installs it and generates `/root/listmonk-admin-password`, applies its settings) and starts it, then recreates every container with its logs going to the journal.
6. **Check:**
   - `docker compose -f compose.prod.yml ps`: four services, each `healthy`;
   - `curl -s http://127.0.0.1:9000/health` on the server prints `{"data":true}`, and the same from your computer to `<server-ip>:9000` gets no answer; `docker version --format '{{.Server.Version}}'` is 28 or later (older Docker let machines on the same network segment reach ports published on 127.0.0.1);
   - `docker compose -f compose.prod.yml logs app | grep 'Email cap'` shows the app's start line, now read from the journal: `Email cap of the forms: 50 an hour, 200 a day (default)`;
   - `cd backup && sudo ./backup.sh`, then `sudo ./restore.sh test latest`: both databases are stored and restored ("Restore tests passed: gliagora listmonk."), and `docker volume ls -f dangling=true` lists nothing new;
   - the site still asks for the password: `curl -s -o /dev/null -w '%{http_code}\n' https://gliagora.com/en/` answers `401`, and `https://gliagora.com/health/` `200`;
   - the SSH tunnel and the admin (section 11) work; save the admin password in the password manager.

## Checking from outside

Check the site from another computer with single requests (`curl`, a browser). Do not scan the server's ports at full speed from your own connection: during S, a scan of all 65,535 ports made the provider's network block that IPv4 address for about 20 minutes (IPv6 kept working). If you must, scan slowly or from elsewhere.

## Useful commands

```sh
docker compose -f compose.prod.yml ps               # status and health
docker compose -f compose.prod.yml logs -f app      # app logs
docker compose -f compose.prod.yml restart caddy    # after editing the Caddyfile or admin-auth.caddy
sudo ufw status verbose                             # firewall
sudo fail2ban-client status sshd                    # blocked SSH addresses
sudo journalctl -t sudo | grep deploy-remote        # every deploy the deploy user started (14 days)
docker compose -f compose.prod.yml logs -f listmonk # listmonk's logs
ssh -N -L 9001:127.0.0.1:9000 gliagora@<server-ip>  # listmonk's admin at http://localhost:9001/admin/ (section 11)
```

Every container logs to the system journal, which keeps 14 days (D34): `docker compose … logs` reads it, and so do `journalctl -t gliagora-app-1` and `journalctl -u gliagora-backup`. Kernel lines (the firewall's blocked packets) still go to `/var/log/ufw.log` and `kern.log` through rsyslog, which keeps them about four weeks: an open point, outside the containers' logs.

## Decided during the server setup (S, D42)

- **Staging:** none while the site is private; production, behind the site-wide password, doubles as staging. A separate staging is reconsidered before the site goes public.
- **Automatic rollback:** built into `deploy-remote.sh` (see "How deploys work").
- **Rate limits in Caddy** (for the auth routes and `/en/search/`; they need a plugin and a custom Caddy build): on the pre-launch checklist (PLAN §20). Until then, the site-wide password guards `/admin` and `/api` (so also Payload's sign-in, password-reset and first-account routes), Payload locks an account for 15 minutes after 5 failed sign-ins and sends at most one reset email per account every 15 minutes, the public forms have their own rate limits, and search runs at most two institution searches at a time, each for at most 2 seconds.
- **Backup alerts** (success and failure emails): built with M2's server parts (`backup/alert.sh`, step 3); they start sending once the mailbox's `SMTP_*` settings and `ALERT_EMAIL` are set.
- **Deploy secrets:** repository secrets (step 4), a deploy user that is not an admin, and the pinned host key.
- **Admin sudo:** without a password (see "Who logs in").

listmonk (M2) has its own database and user in the same PostgreSQL (section 11); Umami will get its own the same way.
