# FederatedGateWay

A management UI for [Frank!Gateway](https://github.com/wearefrank/frank-gateway), an Apache APISIX-based API gateway built by WeareFrank. FederatedGateWay lets you configure and monitor the gateway through a browser instead of editing YAML files by hand.

## What it does

- Design and manage routes, upstreams, consumers and services via a form-based UI
- Validate APISIX config files against the live schema
- Topology in React flow build from the config your editing

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Running with Docker

**1. Clone the repository:**
```bash
git clone https://github.com/wearefrank/frank-gateway-console.git
cd frank-gateway-console
```

**2. start with the management UI:**
```bash
docker compose --profile ui up
```

**Or Start the gateway only:**
```bash
docker compose up
```

| Service | URL | Description |
|---|---|---|
| **Management UI** `--profile ui` | http://localhost:8080 | FederatedGateWay console |
| **APISIX** | http://localhost:9880 | The API gateway - send your requests here |
| **APISIX Control API** | http://localhost:9882 | Used internally to fetch schema and live routes |
| **Prometheus** | http://localhost:9090 | Metrics collection and querying |

> **Note:** When routing traffic to services on your host machine, use `host.docker.internal` instead of `127.0.0.1` in your upstream nodes.

---

## Local development

**Prerequisites:** Java 25, Maven, Node.js 22+

**1. Start the gateway:**
```bash
docker compose up
```

**2. Start the backend:**
```bash
cd Back-End
./mvnw spring-boot:run
# Runs on http://localhost:8080
```

**3. Start the frontend:**
```bash
cd front-end
npm install
npm run dev
# Runs on http://localhost:5173
```

**4.** Open http://localhost:5173/config and set the host to `http://127.0.0.1`, control port `9882`, metrics port `9881`.

---

## Kubernetes / Helm

A sample Helm chart is available in the `helm/` directory. It is provided as a starting point.

```bash
helm install federated-gateway ./helm
```

---

## TLS and FSC/NLX support

By default the gateway runs over plain HTTP. To enable HTTPS or the FSC/NLX plugin (for connecting to the Dutch government NLX network), create a `.env` file next to the compose file. See `.env.example` in the [Frank!Gateway repository](https://github.com/wearefrank/frank-gateway) for the variables and format.

- **Server certificate and key** - required for the gateway to accept HTTPS connections from clients
- **Client certificate chain** - required for mutual TLS, used by the FSC/NLX plugin to authenticate the gateway to other NLX parties
- **Self-signed CA** - used to trust certificates from internal or custom upstream services
