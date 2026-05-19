# FederatedGateWay — Setup Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

---

## Running with Docker (recommended)

Clone the repository and start all services with a single command:

```bash
git clone <repo-url>
cd FederatedGateWay
docker compose up
```

Docker pulls the pre-built images from GitHub Container Registry automatically — no local build tools needed.

| Service | URL | Description |
|---|---|---|
| **Management UI** | http://localhost:3000 | FederatedGateWay frontend |
| **APISIX HTTP proxy** | http://localhost:9080 | Send requests through APISIX here |
| **APISIX HTTPS proxy** | https://localhost:9443 | |
| **APISIX Control API** | http://localhost:9092 | `/v1/routes`, `/v1/schema`, etc. |
| **APISIX Metrics** | http://localhost:9091 | Prometheus scrape endpoint |
| **Prometheus** | http://localhost:9090 | Metrics UI |

---

## APISIX configuration

Routes, upstreams, services, and consumers are defined in **`test-apisix-config.yaml`** at the repo root. Edit this file to change what APISIX serves — changes take effect after restarting the `apisix` container:

```bash
docker compose restart apisix
```

> **Note:** Upstream nodes must use `host.docker.internal` (not `127.0.0.1`) when targeting services running on your host machine.

The three example routes that ship with this repo:

| Route | URI | Notes |
|---|---|---|
| `test-test-test-route` | `GET /hello` | Returns `hello`, rate-limited to 2 req/60 s |
| `host-test-test-route` | `GET /world` | Returns `hello world` via httpbin upstream |
| `veiligheidenvergunningen-test-test-route` | `GET /secure-test` | Requires `apikey: auth-one` header (consumer: jacks) |

---

## Backend connection settings

The backend stores its APISIX connection settings in **`backend-config.yaml`** at the repo root. The default Docker values are:

```yaml
host: "http://apisix"
controlPort: 9092
metricsPort: 9091
```

These can also be changed at runtime via the **Config** page in the UI at http://localhost:3000/config. Changes are written back to `backend-config.yaml` and persist across restarts.

---

## TLS / certificates

The `frank-gateway/.env` file contains the TLS certificates and keys used by APISIX. This file is required — without it the `apisix` container will not start. The file is already present in the repository.

---

## Rebuilding images locally

If you have made code changes and want to test them before pushing:

```bash
docker compose up --build
```

This builds both the backend and frontend images locally using the Dockerfiles in `Back-End/` and `front-end/`.

---

## Local development (without Docker)

### Prerequisites

- Java 21+, Maven
- Node.js 22+

### Backend

```bash
cd Back-End
./mvnw spring-boot:run
# Starts on http://localhost:8080
```

### Frontend

```bash
cd front-end
npm install
npm run dev
# Starts on http://localhost:5173
```

The frontend dev server proxies `/api` requests to `http://localhost:8080` via the Vite proxy configured in `vite.config.ts`.

Run APISIX locally using the frank-gateway compose file:

```bash
docker compose up apisix prometheus httpbin
```

Then configure the backend via http://localhost:5173/config to point to `http://127.0.0.1` (the default).
