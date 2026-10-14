# FederatedGateWay

A web console for [Frank!Gateway](https://github.com/wearefrank/frank-gateway), the APISIX-based API gateway from WeAreFrank. Instead of editing YAML by hand, you manage the gateway from your browser.

With it you can:

- Create and edit routes, upstreams, consumers and services through forms
- Check a config file against the live APISIX schema
- See your config as a topology graph
- Watch traffic on a dashboard built on Prometheus and Loki

## Quick start

All you need is [Docker Desktop](https://www.docker.com/products/docker-desktop/). The images are published, so nothing gets built. You do need the repo though, because the compose file reads its configs from the `config/` folder:

```bash
git clone https://github.com/wearefrank/frank-gateway-console.git
cd frank-gateway-console
SPRING_PROFILES_ACTIVE=localdev docker compose --profile ui up
```

Open http://localhost:8080 and log in with `admin`/`admin` or `user`/`user`. These accounts are for local use only.

Leave out `--profile ui` if you only want the gateway without the console.

| Service | URL |
|---|---|
| Console | http://localhost:8080 |
| APISIX proxy | http://localhost:9880 |
| APISIX Control API | http://localhost:9882 |
| Prometheus | http://localhost:9090 |
| Loki | http://localhost:3100 |
| Grafana | http://localhost:3000 |
| Keycloak (`--profile keycloak`) | http://localhost:8081 |

Tip: to reach a service running on your own machine, use `host.docker.internal` in your upstream, not `127.0.0.1`.

## Changing the gateway config

The gateway reads two files from `config/`:

- `apisix.yaml` holds your routes, upstreams, services and consumers. Changes are picked up within a second.
- `apisix-config.yaml` holds the gateway settings and enabled plugins. After changing it, restart with `docker compose up -d --force-recreate apisix`.

## Environment variables

Every setting is listed with a short explanation in [`.env.example`](.env.example). Copy it to `.env` next to `docker-compose.yaml` and change what you need. The ones you'll touch most:

| Variable | What it does |
|---|---|
| `APISIX_HOST` | Where the console finds the gateway |
| `PROMETHEUS_URL` | Where the metrics for the charts come from |
| `GIT_SETTINGS_LOCKED` | Locks the console to one Git repo and file, so users can't change it |
| `GIT_TOKEN` | A shared Git token, so users don't need their own |

Some things that are easy to miss:

- In `.env`, write a `$` as `$$`, because Docker Compose treats `$` as the start of a variable. This matters for bcrypt hashes.
- Some variables are commented out in `docker-compose.yaml`. Setting them in `.env` does nothing until you uncomment them there.
- `APISIX_HOST` and the APISIX ports are only used on the very first start. After that the console saves them in its `/data` volume, and you change them on the Connection Settings page.

The images are also available on their own if you want to use them in your own setup:

- Gateway: `ghcr.io/wearefrank/frank-gateway:master`
- Console: `ghcr.io/wearefrank/federated-gateway-console:latest`

## Signing in

The console always needs a login. You choose how with `CONSOLE_AUTH_TYPE`:

- `OAUTH2` (default): log in through Keycloak or another OpenID Connect provider. Set `KEYCLOAK_ISSUER_URI`, `KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_SECRET`, and add `https://<console>/login/oauth2/code/keycloak` as a redirect URI on the client.
- `IN_MEMORY`: a simple login form with accounts you define yourself in config. No sign-up, password reset or MFA. Good for when you can't run an identity provider.

If the value is missing or wrong, the console won't start. That's on purpose, so it never ends up running without a login.

Roles are read from the token claim set in `KEYCLOAK_AUTHORITIES_CLAIM`. For Keycloak client roles that's `resource_access.<client-id>.roles`, for realm roles `realm_access.roles`. The default, `resource_access.frank-confidential.roles`, only matches the bundled test realm, so set it to your own client id. If users log in but have no roles, make sure your Keycloak client has a roles mapper with "Add to access token" turned on.

For local accounts, see option c in `.env.example`.

## Connecting GitHub or GitLab

The version history page saves your gateway config in a Git repo. By default each user pastes a personal access token. With Keycloak you can do better: users link their GitHub or GitLab account once, and the token never reaches the browser.

### Personal access token permissions

The console only lists commits and reads and writes the config file, so a token needs read and write access to that one repo:

| Provider | Token permissions |
|---|---|
| GitHub (fine-grained, recommended) | Only the config repo, **Contents: Read and write** |
| GitHub (classic) | `repo` (covers all of the user's repos) |
| GitLab | `api`, plus at least the Developer role and push rights on the branch. `write_repository` isn't enough, because the console commits through the API. |
| Gitea | `write:repository` |

The same goes for `GIT_TOKEN`. Everyone who can sign in writes with it, so limit it to the config repo.

### Linking accounts through Keycloak

The local `keycloak` profile already has this set up in its test realm, `frank`. Just fill in the `GITHUB_IDP_*` / `GITLAB_IDP_*` values in `.env`, and set the callback URL of your GitHub OAuth app to `http://localhost:8081/realms/frank/broker/github/endpoint` (for GitLab, use `gitlab` in the path). On your own Keycloak the callback is `https://<keycloak-host>/realms/<realm>/broker/<alias>/endpoint`. Linked accounts are only kept in memory, so you'll have to link again after recreating the Keycloak container.

On your own Keycloak, a realm admin needs to:

1. Add an identity provider called `github` and/or `gitlab`.
2. Turn on **Store tokens** and **Stored tokens readable**. Use scopes `read:user user:email repo` (GitHub) or `openid read_user api` (GitLab). For GitHub, also turn on **JSON Format**.
3. Give users the client roles `broker` → `read-token` and `account` → `manage-account`.
4. Add `https://<console>/api/git/link/callback` as a redirect URI on the console client.
5. Set `GIT_BROKER_PROVIDERS=github,gitlab` on the console.

Keep in mind that GitHub's `repo` scope gives the console access to all of a user's repos, not just the config one. Gitea isn't supported here and keeps using tokens.

## Local development

You need Java 25, Maven and Node.js 22+.

```bash
# 1. Start the gateway (add --profile keycloak to test with Keycloak)
docker compose up

# 2. Start the backend on http://localhost:8080
cd Back-End
./mvnw spring-boot:run -Dspring-boot.run.profiles=localdev   # drop the profile to use Keycloak

# 3. Start the frontend on http://localhost:5500
cd front-end
npm install
npm run dev
```

Open http://localhost:5500 and log in with `admin`/`admin`. Then go to `/config` and set the host to `http://127.0.0.1`, control port `9882` and metrics port `9881`.

## Deploying to Kubernetes

See [`deploy/README.md`](deploy/README.md).

## Monitoring

The dashboard uses Prometheus for the charts and Loki for the access log. If one of them is down, only its panels show an error, the rest keeps working. Prometheus collects metrics from the gateway's metrics port, as set up in `config/prometheus.yml`.

For your own queries, open Grafana at http://localhost:3000. Prometheus and Loki are already added there as data sources. Grafana has no login and gives everyone admin rights, so don't expose it beyond your own machine.

## Loki and the access log

APISIX sends each request to Loki through the `loki-logger` plugin in `config/apisix.yaml`, which also sets the log format and labels.

Settings that matter:

- `LOKI_URL`: where the console finds Loki. Point the `endpoint_addrs` of `loki-logger` at the same Loki.
- `LOKI_ENABLED=false`: use this if you don't run Loki. The dashboard then hides the log table, the message counter and the traffic-per-route table.
- `LOKI_NAMESPACE`: when several environments share one Loki, this shows only logs from yours. Give a comma-separated list for more than one. The console applies this filter itself, so it only limits what the dashboard shows. Logs that really must stay hidden belong in a separate Loki tenant.

### Matching your log format

The columns in the log table come from `config/log-fields.yaml`, not from code. Each entry is one column, plus where to find its value in the log line:

```yaml
logs:
  fields:
    - id: userAgent
      label: User agent
      type: MUTED
      paths: [request.headers.user_agent]
      visible-for: [MESSAGES]
```

If you change the `log_format` in APISIX, update this file to match and restart the console. The file is only read at startup. Your file replaces the built-in list completely, so start from a copy of the existing one. If there's a mistake in it, like a duplicate id, the console won't start and tells you what's wrong.

Outside of Docker Compose, mount the file anywhere and set `LOG_FIELDS_FILE` to its path. [`config/log-fields-k8s-example.yaml`](config/log-fields-k8s-example.yaml) shows how to do this on Kubernetes with a flat log format.

## TLS and FSC/NLX

The gateway uses plain HTTP by default. To turn on HTTPS or the FSC/NLX plugin, put the certificate settings in your `.env`. The variable names are in `.env.example` in the [Frank!Gateway repo](https://github.com/wearefrank/frank-gateway).
