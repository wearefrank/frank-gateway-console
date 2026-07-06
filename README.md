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

## Quick Start

**Prerequisite:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

Both the gateway and the console are published as ready-to-run images, so you don't need to clone this repo just to run it — grab the compose file on its own:

```bash
curl -O https://raw.githubusercontent.com/wearefrank/frank-gateway-console/master/docker-compose.yaml
```

**Option A — Just the gateway**
```bash
docker compose up
```
Starts Frank!Gateway (APISIX) and Prometheus. Routes are configured by editing the inline YAML under `configs:` in `docker-compose.yaml`.

**Option B — Gateway + management console**
```bash
docker compose --profile ui up
```
Adds the FederatedGateWay console, so you can configure and monitor everything from a browser instead.

| Service | URL | Included in |
|---|---|---|
| APISIX (proxy) | http://localhost:9880 | A & B |
| APISIX Control API | http://localhost:9882 | A & B |
| Prometheus | http://localhost:9090 | A & B |
| **Console UI** | http://localhost:8080 | B only |

> **Note:** When routing traffic to services on your host machine, use `host.docker.internal` instead of `127.0.0.1` in your upstream nodes.

---

## Using the images in your own setup

Both images are on GHCR, so you can drop them into infrastructure you already manage instead of using this repo's compose file or Helm chart directly.

- **Gateway:** `ghcr.io/wearefrank/frank-gateway:master`
- **Console:** `ghcr.io/wearefrank/federated-gateway-console:latest`

### In your own docker-compose file

```yaml
services:
  apisix:
    image: ghcr.io/wearefrank/frank-gateway:master
    ports:
      - "9880:9080"   # HTTP proxy
      - "9882:9092"   # Control API
      - "9881:9091"   # Prometheus metrics
    volumes:
      - ./apisix.yaml:/usr/local/apisix/conf/apisix.yaml
      - ./config.yaml:/usr/local/apisix/conf/config.yaml

  console:
    image: ghcr.io/wearefrank/federated-gateway-console:latest
    ports:
      - "8080:8080"
    environment:
      - APISIX_HOST=http://apisix          # point at the apisix service above
      - PROMETHEUS_URL=http://prometheus:9090
    volumes:
      - console_data:/data                 # persists the console's own connection settings

volumes:
  console_data:
```

### In your own Helm chart

Reference the images as values (this is exactly what `helm/values.yaml` in this repo does):

```yaml
# values.yaml
frankgateway:
  image: ghcr.io/wearefrank/frank-gateway:master
console:
  image: ghcr.io/wearefrank/federated-gateway-console:latest
```

```yaml
# templates/console.yaml (excerpt)
containers:
  - name: console
    image: {{ .Values.console.image }}
    env:
      - name: APISIX_HOST
        value: "http://{{ .Release.Name }}-frankgateway"
      - name: PROMETHEUS_URL
        value: "http://{{ .Release.Name }}-prometheus:9090"
    ports:
      - containerPort: 8080
```

See `helm/templates/console.yaml` for the full working version, including the PVC used to persist `/data`.

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
