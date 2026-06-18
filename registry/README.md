# argus registry

Public community hook scripts for [argus](https://github.com/ruydt/argus). The
registry lives in this `registry/` directory of the monorepo and is served to
argus over HTTP from the `main` branch.

`index.json` is generated from the script headers by `build-index.mjs`. It is
**not** rebuilt automatically on merge (the workflow under
`registry/.github/workflows/` does not run from the repo root), so regenerate it
by hand after adding or changing a script.

## Contribute a script

1. Add one file at `scripts/<your-github-login>/<id>.{js,sh,py}` (the extension
   should match the runtime).
2. Start it with an `@argus-meta` header:

   ```js
   // @argus-meta
   // title: Short human title
   // author: your-github-login  # optional; argus stamps the publisher login when omitted
   // event: PreToolUse
   // runtime: node          # node | python3 | sh
   // matcher: Bash          # optional
   // os: both               # optional; both | macos | windows (defaults to both)
   // command: node "$SCRIPT" # optional; explicit command override
   // published: 2026-06-01  # optional
   // purpose: One line describing what it does.
   // @end

   // ...script body...
   ```

3. Regenerate the index, then open a PR:

   ```bash
   cd registry
   node build-index.mjs
   ```

   argus then lists your script in its Community tab.

## How argus reads the registry

By default argus fetches
`https://raw.githubusercontent.com/ruydt/argus/main/registry/index.json`. Override
the base with the `ARGUS_REGISTRY_RAW_URL` env var — set it to the registry
directory base, e.g.
`https://raw.githubusercontent.com/<owner>/<repo>/main/registry` — when running a
fork or a self-hosted copy. The publish flow (GitHub login → PR) forks
`ruydt/argus` and opens the PR against the monorepo's `registry/` directory.
