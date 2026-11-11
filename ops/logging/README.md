# Persistent backend logs

This separate Docker Compose project archives stdout/stderr from the local
Swarm service `jd-backend_api` in Loki for **192 hours (eight days)**. Alloy
discovers replacement backend containers automatically using their Swarm service
label. No application secret or logging-driver plugin is required.

```text
jd-backend_api container stdout/stderr (original UTC timestamps)
            |
            +--> Docker json-file: bounded local replay buffer
            |
            +--> Alloy Docker collector --> Loki --> persistent Docker volume
                                                |
                                         eight-day retention
                                                |
                                time/ID searches and file exports
```

The application stack still uses Docker's normal `json-file` driver, so
`docker service logs` and `docker logs` continue to work. Loki is the archive;
those Docker commands do not read it. Their output can still rotate sooner than
eight days. The application stack's buffer is increased to five 50 MB files per
container on its next deployment. That buffer is not time-based retention.

## Scope and capacity

- Install on `srv1536765`, the host running the backend. Collection is local to
  the Docker daemon. If Swarm schedules the backend elsewhere, install collection
  there too and plan shared/remote storage; local named volumes do not move
  between Swarm nodes.
- The logging project runs independently of the backend CI deployment. Backend
  replacements and Compose container recreation do not remove its named volumes.
- Logging containers have memory limits of 768 MB (Loki) and 384 MB (Alloy), and
  CPU limits of 0.5 and 0.25. Check `free -h`, `df -h /var/lib/docker`, and
  `docker system df` before installation; allow at least 1.5 GB of memory headroom
  and several GB of disk headroom in addition to the application/database needs.
- Only backend logs are collected. Vercel browser/server-action errors and
  Traefik access logs are separate sources and are not automatically included.
- Existing entries still present in a running backend container may be collected
  on first installation. Entries already rotated out cannot be recovered.

## Access and persistence

Loki (`3100`) and Alloy (`12345`) publish on `127.0.0.1` only, using a dedicated
bridge network. This network allows outbound connections; it is not an
`internal: true` network, because recent Docker versions do not publish ports
from internal-only networks. They are not on the Traefik network and do not have
public routes. Loki has no application-level
authentication: keep it restricted to trusted server users or an authenticated
SSH tunnel, and do not change these bindings to `0.0.0.0`.

Alloy needs access to `/var/run/docker.sock` to discover and read container logs.
A read-only socket mount does **not** make the Docker API read-only. Treat this
pinned collector image as privileged, like other host monitoring agents; do not
add untrusted code or public routes to it. It drops Linux capabilities and has
a read-only root filesystem, but these do not constrain Docker API privileges.

The fixed named volumes are `jd-logging-loki-data` and `jd-logging-alloy-data`.
Loki's archive, compactor markers and ingestion WAL are stored in the first;
Alloy's read positions are stored in the second, mounted at `/data`. A fresh
mount is used rather than inheriting the image's restricted data-directory
ownership. Do not use `docker compose down
-v`, delete these volumes, or include them in a volume-pruning job. A host disk
failure still requires backups/remote storage to recover logs.

Logs can contain customer information and raw webhook payloads already emitted
by the payment plugin. Restrict server access and export permissions; never
commit exported logs or post them unredacted. This setup does not add any new
payment-payload logging or automatically redact existing application output.

## Install on the server

Requires Linux with systemd, Docker Engine, Docker Compose v2, and Node.js 20+ for the optional
export command (or use the Docker fallback below). From a checkout containing
these reviewed files:

```bash
free -h
df -h /var/lib/docker
sudo docker compose version

sudo install -d -m 0750 /opt/jd-logging
sudo install -m 0644 ops/logging/compose.yml ops/logging/loki.yml \
  ops/logging/config.alloy ops/logging/export-logs.mjs /opt/jd-logging/
sudo install -m 0644 ops/logging/jd-logging.service /etc/systemd/system/

sudo docker compose -f /opt/jd-logging/compose.yml config --quiet
sudo docker compose -f /opt/jd-logging/compose.yml run --rm --no-deps \
  loki -config.file=/etc/loki/config.yml -verify-config=true
sudo docker compose -f /opt/jd-logging/compose.yml run --rm --no-deps \
  alloy validate /etc/alloy/config.alloy

sudo systemd-analyze verify /etc/systemd/system/jd-logging.service
sudo systemctl enable --now docker.service
sudo systemctl daemon-reload
sudo systemctl enable --now jd-logging.service
sudo systemctl status jd-logging.service --no-pager
sudo docker compose -f /opt/jd-logging/compose.yml ps
```

This does not restart or modify the running backend when Docker is already
running. The systemd unit bootstraps Compose after Docker, networking and the
data filesystem are available. Docker's `unless-stopped` policies supervise
individual container crashes; the unit is only a oneshot bootstrap, not a
competing container process supervisor. `PartOf=docker.service` re-runs it when
Docker is restarted through systemd. Startup failures retry every 15 seconds.

Images are pulled by the validation/install commands above. Boot uses
`--pull never`, so reboot does not depend on Docker Hub or install new software.
Missing images/configuration produce a failed/retrying unit rather than a silent
skip. Keep the files in `/opt/jd-logging`, preserve the named volumes, and avoid
pruning the logging images. If images are missing, run `docker compose -f
/opt/jd-logging/compose.yml pull` then restart `jd-logging.service`.

`systemctl status` should show **active (exited)** for this oneshot service. This
means Compose was started successfully, not that ingestion is healthy; use the
readiness and ingestion checks below as well. Configuration updates require
copying the files again and running `systemctl restart jd-logging.service`;
editing repository files alone does not update `/opt/jd-logging`. After changing
the unit file itself, run `systemctl daemon-reload` before restarting it.

### Reboot behavior and maintenance

```text
Host boots --> Docker and data filesystem ready --> jd-logging.service
                                                       |
                                             Compose creates/starts
                                             Loki and Alloy using
                                             the existing volumes
                                                       |
                                             Collection resumes
```

Use `sudo systemctl stop jd-logging.service` for a temporary maintenance stop.
It stops containers without deleting data; the enabled unit starts them at the
next boot. To intentionally keep logging stopped across reboots, use
`sudo systemctl disable --now jd-logging.service`. Re-enable it with
`sudo systemctl enable --now jd-logging.service`. Do not use direct container
stops as a permanent disable mechanism, because the bootstrap starts them again.

After the next **planned** server reboot (do not reboot a live checkout just to
test this), run:

```bash
sudo systemctl is-enabled docker.service jd-logging.service
sudo systemctl status jd-logging.service --no-pager
sudo docker compose -f /opt/jd-logging/compose.yml ps
curl -fsS http://127.0.0.1:3100/ready
curl -fsS http://127.0.0.1:12345/-/ready
sudo journalctl -u jd-logging.service -b --no-pager
```

Export a known log from before the reboot and verify a new backend request is
also collected. Earlier entries remain queryable until their eight-day expiry;
time spent powered off does not extend retention. Docker Compose/systemd cannot
recover deleted volumes or a failed host disk, so keep a separate backup if
that failure mode must be covered. Startup automation also does not replace
disk-space/ingestion monitoring or a controlled image-upgrade process.

### Check readiness and actual ingestion

Loki can take roughly a minute to become ready initially. Repeat the readiness
check after startup if necessary:

```bash
curl -fsS http://127.0.0.1:3100/ready
curl -fsS http://127.0.0.1:12345/-/ready
sudo docker compose -f /opt/jd-logging/compose.yml logs --tail 50
```

Readiness alone does not establish that logs are being collected. This temporary
container emits a clearly marked test log under the backend service label; it
does not place an order, call a payment API or send an analytics event:

```bash
PROBE="jd-logging-check-$(date -u +%Y%m%dT%H%M%SZ)"
sudo docker run -d --rm --name "$PROBE" \
  --label com.docker.swarm.service.name=jd-backend_api \
  alpine:3.22 /bin/sh -c 'echo "$1"; sleep 30' sh "$PROBE"
```

After 10–15 seconds, check for it:

```bash
sudo node /opt/jd-logging/export-logs.mjs \
  --start "$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --contains "$PROBE" --require-results
```

If `sudo node` is unavailable because Node is installed only through a user's
NVM, use the Docker fallback below. Do not call installation complete until the
probe and real backend request logs are visible. To verify persistence, allow the
probe container to finish and be removed, restart the logging project, wait for
readiness, then query the same probe with the same time range again.

## Search and export an incident

### Browse readable daily files

Loki stores internal index/chunk files, not daily text files. The optional daily
export timer creates the readable copies requested for direct server browsing:

```text
/var/log/jd-backend/
  2026-11-10-IST.log
  2026-11-11-IST.log
```

Filenames use Indian calendar days, each beginning at midnight IST. Individual
lines retain the original UTC timestamps, as in Docker logs. Only days with
available entries appear; missing history is not represented by empty files.

To add this on a server where Loki/Alloy are already working, run from a checkout
containing these files:

```bash
sudo install -d -m 0700 /var/log/jd-backend
sudo install -m 0644 ops/logging/archive-daily-logs.mjs /opt/jd-logging/
sudo install -m 0644 ops/logging/jd-logging-daily.service \
  ops/logging/jd-logging-daily.timer /etc/systemd/system/
sudo docker pull node:22-alpine
sudo systemd-analyze verify /etc/systemd/system/jd-logging.service \
  /etc/systemd/system/jd-logging-daily.service /etc/systemd/system/jd-logging-daily.timer
sudo systemctl daemon-reload
sudo systemctl enable --now jd-logging-daily.timer
sudo systemctl start jd-logging-daily.service
sudo systemctl status jd-logging-daily.service --no-pager
sudo systemctl list-timers jd-logging-daily.timer
```

The initial export may take a few minutes while it reads up to eight dates. The
job does not restart the backend or the logging collectors. It runs a temporary,
resource-limited Node container, has no Docker socket mounted inside that
container, and queries only the loopback Loki API. The host's systemd unit has
the Docker access needed to launch it. Node's image is pulled during installation
and boot never attempts an image download.

As root, browse the files directly:

```bash
cd /var/log/jd-backend
ls -lh
less 2026-11-11-IST.log
grep -nEi -C 5 'razorpay|error|cart_YOUR_ID|pay_YOUR_ID' 2026-11-11-IST.log
```

Refreshes run every 15 minutes, so the current file can lag live activity by
that interval plus export runtime. For continuous live logs, use `docker service
logs --follow --tail 100 jd-backend_api`. `tail -F` follows a daily file across
atomic replacements; `tail -f` can stay attached to its old inode.

The first export backfills today's IST date plus the previous seven dates. Later
runs refresh today/yesterday, and catch up across all eight dates after a missed
period or if explicitly requested. This supports one full week of readable
history once sufficient logs have been collected. An older file is removed only
after all queries in a refresh succeed. Unrelated filenames are left alone.
Failed or empty exports do not erase an existing daily copy, and partially
written files are never substituted for complete files.

Normal refreshes allow next-day ingestion corrections. For unusually delayed
entries older than yesterday, regenerate all retained dates explicitly:

```bash
sudo docker run --rm --pull=never --network host \
  --mount type=bind,source=/opt/jd-logging,target=/tools,readonly \
  --mount type=bind,source=/var/log/jd-backend,target=/logs \
  node:22-alpine node /tools/archive-daily-logs.mjs --directory /logs --backfill
```

Stop the timer and wait for any active `jd-logging-daily.service` run to finish
before this manual backfill; re-enable the timer afterward. Both the date grouping
and the eight-date deletion policy apply to these daily copies independently of
Loki's rolling 192-hour retention. Keep unrelated investigation files elsewhere.

For a failed scheduled export, inspect
`sudo journalctl -u jd-logging-daily.service --since today --no-pager`. Check disk
usage with `sudo du -sh /var/log/jd-backend`. Daily copies consume additional
uncompressed disk space and contain the same sensitive data as the source logs;
the directory is root-only and new files have mode `0600`.

### Export a custom time window

Always provide a timezone. The command accepts either `Z` for UTC or `+05:30` for
IST, preserves the original nanosecond UTC log timestamp, and paginates results.
The start time is inclusive and the end time is exclusive. All stdout is log
data; counts and errors go to stderr. A nonzero exit means the file may be
incomplete. `--require-results` also returns nonzero for an empty result.

Example: two hours before and after a 21:48 IST incident. Replace the date with
an incident that occurred while collection was running and is still retained.
The 7 November incident cannot be recovered by installing this later.

```bash
umask 077
sudo node /opt/jd-logging/export-logs.mjs \
  --start '2026-11-10T19:48:00+05:30' \
  --end   '2026-11-10T23:48:00+05:30' \
  > backend-incident.log

grep -nEi -C 5 'cart_ID|payses_ID|pay_ID|error|failed|timeout' backend-incident.log
```

For a smaller export, pass `--contains 'cart_...'` or `--contains 'pay_...'`.
This literal text filter omits nearby lines without that ID; export the whole
time window first when diagnosing a failure. `--service` defaults to
`jd-backend_api`. There is no default time range, avoiding accidental exports of
all customer logs.

Docker fallback (Linux; no Node installation on the host required):

```bash
umask 077
sudo docker run --rm --network host \
  -v /opt/jd-logging:/tools:ro node:22-alpine \
  node /tools/export-logs.mjs \
  --start '2026-11-10T19:48:00+05:30' \
  --end   '2026-11-10T23:48:00+05:30' \
  > backend-incident.log
```

For an interactive API browser from your workstation, tunnel with
`ssh -L 3100:127.0.0.1:3100 jdadmin@srv1536765`. An optional Grafana UI can be
added later; no additional paid service or public endpoint is needed here.

## Retention and operational checks

Loki's compactor enforces `retention_period: 192h` using 24-hour TSDB indexes.
Old chunks are deleted asynchronously after the configured two-hour deletion
delay. Eight-day retention is a policy for successfully collected logs, not a
guarantee against outages, a full disk, missing application log statements or
data loss. No software can reconstruct a browser action that was never logged.

Monitor these regularly and connect them to your existing monitoring if present:

```bash
sudo docker compose -f /opt/jd-logging/compose.yml ps
curl -fsS http://127.0.0.1:3100/ready
curl -fsS http://127.0.0.1:12345/-/ready
sudo docker compose -f /opt/jd-logging/compose.yml logs --since 1h \
  | grep -Ei 'error|dropping|failed|no space|429|400'
df -h /var/lib/docker
sudo docker system df -v
```

Alloy retries recoverable ingestion errors indefinitely, but its stable
`loki.write` configuration does not have a durable outgoing queue. Prolonged
outages, collector restarts while writes are pending, or permanent HTTP errors
can lose entries. Persisted source positions and the larger Docker buffer are
not an end-to-end delivery guarantee. Loki's WAL protects acknowledged writes
across Loki process restarts. A separate external archive/managed service and
alerting are needed if stronger availability guarantees are required.

The filesystem archive has no disk-capacity eviction policy. Size storage for
eight days of observed volume plus WAL/index/deletion-delay headroom. If disk
space is low, expand storage or reduce ingestion; do not silently shorten the
eight-day retention or delete volume files manually. Docker's native logs and
the logging containers' own logs have separate bounded size-based rotation.

Exports are deliberate investigation artifacts and are not automatically
deleted by Loki. Apply your incident-record policy to those files separately.

## Validation

```bash
node ops/logging/export-logs.test.mjs
```

The daily archive tests also cover Indian calendar boundaries, file replacement,
failed/empty exports, and retention cleanup. The dedicated GitHub workflow validates Compose, checks both pinned binaries'
configuration parsers, and tests collection plus persistence after removing the
source container and restarting the logging project. It does not deploy logging
to production. The eight-day expiry is verified as configuration; the smoke test
does not wait eight days.

References:
- https://grafana.com/docs/loki/latest/operations/storage/retention/
- https://grafana.com/docs/loki/latest/operations/storage/wal/
- https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/
- https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/
- https://docs.docker.com/engine/logging/drivers/json-file/
