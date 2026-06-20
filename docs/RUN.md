# Running AtomCanvas

AtomCanvas runs as a single local web app — one process, one port, opened in
your browser. This page covers every way to start it on your own machine, the
environment variables you can tune, and how to fix the few things that commonly
go wrong.

> **Goal:** run it on *your own* computer. AtomCanvas is built for single-user
> local use and ships with no authentication, so do not expose it on an
> untrusted network as-is.

## Prerequisites

Depends on how you run it:

| Path | Needs |
| --- | --- |
| **Docker** | Only [Docker](https://docs.docker.com/get-docker/). No Node/Python/conda. |
| **From source** | **Node 22** (see [`../frontend/.nvmrc`](../frontend/.nvmrc)) + **Python 3.10–3.13** on your PATH. |

There is a tiny sample structure at [`../fixtures/water.xyz`](../fixtures/water.xyz)
to try the upload → edit-bond → export flow.

## Option 1 — Docker (easiest, no toolchain to install)

This builds the frontend, installs the backend, and serves everything from one
container:

```bash
docker build -t atomcanvas .
docker run --rm -p 8000:8000 atomcanvas
# then open http://localhost:8000
```

Nothing else to install — no Node, Python, or conda. It is also the most
portable path: the Linux container always gets an `rdkit` wheel, so it works on
Intel Macs too (where the macOS `rdkit` wheel is missing). Change the port with
`-e ATOMCANVAS_PORT=9000 -p 9000:9000`.

## Option 2 — From source (one command, one port)

```bash
# 1. Backend dependencies (no conda required)
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# 2. Build the frontend and serve API + SPA from one uvicorn process
scripts/serve.sh
# then open http://localhost:8000
```

`scripts/serve.sh` builds the SPA into `backend/static/` if it is missing (and
rebuilds automatically when the bundle is stale), then serves it from a single
uvicorn process. `scripts/build.sh` does just the build step.

## Option 3 — `atomcanvas serve` (cross-platform, no bash)

**On Windows (no bash), or to avoid the shell script**, start the same
single-port server with the cross-platform CLI:

```bash
cd backend
pip install -e .       # adds the `atomcanvas` command (or skip and use: python -m app.cli serve)
atomcanvas serve       # builds the SPA if needed, then serves http://localhost:8000
```

`atomcanvas serve` accepts `--host` / `--port` (or the `ATOMCANVAS_HOST` /
`ATOMCANVAS_PORT` env vars) and `--no-build` (skip the npm build when the bundle
is already staged). It still uses Node 22 to build the frontend the first time.
Run it from a source checkout (or an editable `pip install -e .`); a non-editable
`pip install .` cannot find the un-packaged frontend.

## Developing the frontend (two-process, hot reload)

For live frontend reload, run the Vite dev server and the backend separately:

```bash
scripts/start.sh   # backend :8000 + Vite dev server :3000; logs in ./logs
scripts/stop.sh    # tear it down
# then open http://localhost:3000
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full developer workflow, test
conventions, and the local gate (`scripts/check.sh`).

## Environment variables

All paths above honor the same variables:

| Variable | Default | Effect |
| --- | --- | --- |
| `ATOMCANVAS_HOST` | `127.0.0.1` | Interface to bind. `0.0.0.0` exposes it on your LAN (no auth — trusted networks only). |
| `ATOMCANVAS_PORT` | `8000` | Port to bind. |
| `ATOMCANVAS_PYTHON` | *(auto)* | Interpreter override for the helper scripts. Otherwise `python`, falling back to `python3`. |
| `ATOMCANVAS_REBUILD` | `0` | `=1` forces a frontend rebuild before serving. |
| `ATOMCANVAS_FORCE_STALE` | `0` | `=1` skips the stale-bundle freshness check and serves the existing bundle as-is. |
| `ATOMCANVAS_MAX_UPLOAD_MB` | `256` | Upload size cap; a larger upload is rejected with HTTP 413. |

## Troubleshooting

- **Port already in use** — set `ATOMCANVAS_PORT` (and map it through, e.g.
  `-p 9000:9000`, when using Docker).
- **Stale UI after editing the frontend** — `scripts/serve.sh` auto-rebuilds when
  it detects newer sources. Force it with `ATOMCANVAS_REBUILD=1 scripts/serve.sh`,
  or skip the check with `ATOMCANVAS_FORCE_STALE=1`.
- **`rdkit` won't `pip install` on an Intel (x86_64) Mac** — no macOS-Intel wheel
  is published. Use the Docker option above, or an Apple-Silicon Mac / Linux /
  Windows. A conda environment with `rdkit` works too, but is not required.
- **Upload rejected with HTTP 413** — the file exceeds the size cap. Raise it with
  `ATOMCANVAS_MAX_UPLOAD_MB`.
- **Dev tools hang on a machine with a localhost HTTP proxy** — vitest / vite /
  tsc can hang if a system proxy intercepts `localhost`. Unset the proxy vars
  before running; the full prefix is documented in
  [CONTRIBUTING.md](../CONTRIBUTING.md#proxy-caveat-localhost-http-proxy).
