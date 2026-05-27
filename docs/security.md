# Security

Hooker is designed for localhost-use by a single developer on a trusted machine.
It is not a multi-user service and is not intended to be exposed to the public
internet.

## Trust Model

The supported trust model is:

- one local user controls the machine running hooker
- the backend listens on loopback by default
- browser access comes from local development origins
- the SQLite database remains on local storage controlled by the user

There is no auth for loopback use. This is intentional for the local product
scope, but it means network exposure changes the risk model immediately.

## Local Network Posture

Hooker uses multiple local-first guards:

- loopback bind default: `127.0.0.1:8765`
- Host header guard for local hosts
- CORS allowlist for local browser origins
- existing export endpoint browser checks

Remote bind is an explicit opt-in:

```bash
HOOKER_ALLOW_REMOTE=1 ADDR=0.0.0.0:8765 ./hooker
```

Using `HOOKER_ALLOW_REMOTE=1` means you accept that hooker may be reachable
outside the loopback interface. It does not add authentication, encryption, or a
public-sharing access-control layer.

## Unsupported Sharing

Remote sharing, ngrok tunnels, reverse proxies, public DNS, and LAN demos are
unofficial and unsupported. Do not treat hooker as remote-safe unless you add
your own access controls outside the project.

If you experiment with remote access anyway, assume anyone who can reach the
backend can access sensitive local development data, including prompts, diffs,
file paths, tool outputs, raw payloads, and exports.

## Operational Guidance

Keep `ADDR` on loopback for normal use. Run `./scripts/hooker doctor` after
changing network settings and review any warnings before sending new hook
events.
