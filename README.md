# FederatedGateWay

A management UI for [Frank!Gateway](https://github.com/wearefrank/frank-gateway), an Apache APISIX-based API gateway built by WeareFrank. FederatedGateWay lets you configure and monitor the gateway through a browser instead of editing YAML files by hand.

## What it does

- Design and manage routes, upstreams, consumers and services via a form-based UI
- Validate APISIX config files against the live schema
- Configure APISIX connection settings
- Monitor HTTP traffic and metrics via Prometheus

## Running with Docker

FederatedGateWay is distributed as part of the Frank!Gateway Docker Compose setup. No code needs to be cloned.

```bash
curl -O https://raw.githubusercontent.com/wearefrank/frank-gateway/master/docker-compose.yaml
docker compose --profile ui up
```

This starts:

| Service | URL | Description |
|---|---|---|
| Management UI | http://localhost:3000 | This app (frontend) |
| Management API | http://localhost:8080 | This app (backend) |
| APISIX | http://localhost:9080 | The API gateway - send your requests here |
| APISIX Control API | http://localhost:9092 | Used internally to fetch schema and live routes |
| Prometheus | http://localhost:9090 | Metrics collection and querying |

> **Note:** Upstream nodes must use `host.docker.internal` instead of `127.0.0.1` when targeting services running on your host machine from within Docker.

## Local development

You need a running Frank!Gateway instance. The easiest way is to clone it and start it with Docker:

```bash
git clone https://github.com/wearefrank/frank-gateway
cd frank-gateway
docker compose up
```

Then run the backend and frontend in your editor:

**Backend** (requires Java 21+, Maven):
```bash
cd Back-End
./mvnw spring-boot:run
# Starts on http://localhost:8080
```

**Frontend** (requires Node.js 22+):
```bash
cd front-end
npm install
npm run dev
# Starts on http://localhost:5173
```

Open http://localhost:5173/config and point the backend at `http://127.0.0.1` (control port `9092`, metrics port `9091`).

## TLS and FSC/NLX support

By default the gateway runs over plain HTTP. If you need encrypted traffic or the FSC/NLX plugin (for connecting to the Dutch government NLX network), the gateway needs TLS certificates configured via a `.env` file:

- **Server certificate and key** - required for the gateway to accept HTTPS connections from clients
- **Client certificate chain** - required for mutual TLS, used by the FSC/NLX plugin to authenticate the gateway to other NLX parties
- **Self-signed CA** - used to trust certificates from internal or custom upstream services

See `.env.example` in the Frank!Gateway repository for the exact variables and format.
