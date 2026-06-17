# argus-hooks/registry

Public community hook scripts for [argus](https://github.com/argus-hooks/argus).
`index.json` is **auto-generated** by CI — never edit it by hand.

## Contribute a script

1. Add one file at `scripts/<your-github-login>/<id>.js`.
2. Start it with an `@argus-meta` header:

   ```js
   // @argus-meta
   // title: Short human title
   // author: your-github-login  # optional; argus stamps publisher login when omitted
   // event: PreToolUse
   // runtime: node          # node | python3 | sh
   // matcher: Bash          # optional
   // os: both               # optional; both | macos | windows (defaults to both)
   // purpose: One line describing what it does.
   // @end

   // ...script body...
   ```

3. Open a PR. On merge, CI parses the header, computes the `sha256`, and
   regenerates `index.json`. argus then lists your script in its Community tab.

## Maintainer setup (one time)

Push this `registry/` directory to a new **public** repo `argus-hooks/registry`.
argus reads `https://raw.githubusercontent.com/argus-hooks/registry/main/index.json`
(override with the `ARGUS_REGISTRY_RAW_URL` env var).
