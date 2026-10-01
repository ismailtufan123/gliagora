# External services

Every service outside our server that Gliagora uses, what it sees and where it is (PLAN §18.2, "Vendor control"). Adding one needs a KVKK check first and an entry here. Visitors' browsers contact **no** other domain: pages, fonts, the map's tiles, fonts and sprites all come from `gliagora.com` (checked by the end-to-end tests and at S).

| Service | What for | What it sees | Where | Personal data |
| --- | --- | --- | --- | --- |
| Hosting Türkiye | The server (VDS, Istanbul), since S | Everything on the server | Türkiye | Yes: hosts all of it (processor, KVKK Art. 12) |
| Cloudflare | Domain registrar and DNS (DNS only, D1); Email Routing for `hello@` until M2 (D2, §11.4) | DNS: the domain's records and the lookups of visitors' resolvers. Email Routing: incoming mail to `hello@` | Abroad | Email Routing: yes, until it is switched off at M2 |
| GitHub | Code, CI (Actions), container registry (GHCR), the Deploy workflow | Code, test runs with fake data, images | Abroad | No (code only; never personal data, CLAUDE.md) |
| Let's Encrypt | TLS certificates (Caddy) | The domain names | Abroad | No |
| Docker Hub | The Caddy and PostgreSQL images (pinned by digest) | The server's IP address | Abroad | No |
| Ubuntu and Docker package archives | Updates of the server | The server's IP address | Abroad | No |
| Google Public DNS (8.8.8.8) | The server's DNS resolver (set by the provider's cloud-init) | The names the server looks up (the services in this table), never anything a visitor typed | Abroad | No |
| ROR (`api.ror.org`) and Zenodo | Institutions: the nightly check for a new ROR release, the monthly import, and editors adding one by its ROR ID | The server's IP address and the ROR IDs editors enter | Abroad | No |
| Protomaps builds (`build.protomaps.com`, `build-metadata.protomaps.dev`) | The map's basemap (OpenStreetMap data), downloaded to our server by `deploy/basemap/fetch-basemap.sh` about twice a year (M5, PLAN §14) | The server's IP address | Abroad | No |
| GitHub (`protomaps/go-pmtiles`, `protomaps/basemaps-assets`) | The pmtiles tool, and the map's fonts (SIL OFL) and sprites (MIT), each pinned and checked, fetched by the same script | The server's IP address | Abroad | No |

At M2 the Turkish mailbox (its SMTP server sends the newsletter and the forms' emails) joins this table, and Cloudflare Email Routing leaves it.
