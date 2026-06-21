# Security

Argus is designed for localhost-use by a single developer on a trusted machine.
It is not a multi-user service and is not intended to be exposed to the public
internet.

## Trust Model

The supported trust model is:

- one local user controls the machine running argus
- the backend listens on loopback by default
- browser access comes from local development origins
- the SQLite database remains on local storage controlled by the user

There is no auth for loopback use. This is intentional for the local product
scope, but it means network exposure changes the risk model immediately.

## Local Network Posture

Argus uses multiple local-first guards:

- loopback bind default: `127.0.0.1:10804`
- Host header guard for local hosts (blocks DNS rebinding)
- CORS allowlist for local browser origins
- cross-site (`Sec-Fetch-Site`) guard on all sensitive and state-changing
  endpoints — raw payloads, exports, the hook simulator, reveal, hooks-config
  writes, and the collection/registry/GitHub endpoints

Remote bind is an explicit opt-in:

```bash
ARGUS_ALLOW_REMOTE=1 ADDR=0.0.0.0:10804 ./argus
```

Using `ARGUS_ALLOW_REMOTE=1` means you accept that argus may be reachable
outside the loopback interface. It does not add authentication, encryption, or a
public-sharing access-control layer.

**The hook simulator (`/api/hooks/simulate`) and reveal (`/api/collection/reveal`)
run local commands by design.** Direct remote requests are still rejected by the
Host-header guard, but exposing the backend beyond localhost is dangerous — a
reachable simulator is arbitrary command execution. Keep argus on loopback.

## Unsupported Sharing

Remote sharing, ngrok tunnels, reverse proxies, public DNS, and LAN demos are
unofficial and unsupported. Do not treat argus as remote-safe unless you add
your own access controls outside the project.

If you experiment with remote access anyway, assume anyone who can reach the
backend can access sensitive local development data, including prompts, diffs,
file paths, tool outputs, raw payloads, and exports.

## Operational Guidance

Keep `ADDR` on loopback for normal use. Run `./scripts/argus doctor` after
changing network settings and review any warnings before sending new hook
events.
