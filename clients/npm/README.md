# sri-check

Read what an MCP server does **before** you connect to it.

Connecting an MCP server gives it a channel into your context and your tool
calls. `sri-check` reports what a server actually does, with every observation
anchored to a `file:line` in its published source and the code quoted verbatim.

Free, no key, no signup. No dependencies, no install script.

```bash
npx sri-check io.github.firebase/firebase-mcp@0.3.0
```

## Check everything you are already connected to

With no arguments it reads `./.mcp.json`:

```bash
npx sri-check
```

Entries that launch a package (`npx some-mcp-server`) are resolved against the
MCP Registry automatically. Entries that are only a remote URL are reported as
**not checked** — identifying a remote server means connecting to it, which is
the thing you came here to avoid. Pass its registry name explicitly instead.

## Output

```
* io.github.example/thing@1.4.0  (medium, 2 findings)
  • [medium] credential_access — src/auth.ts:41
      const token = process.env.GITHUB_TOKEN ?? readFileSync(os.homedir() + '/.netrc')
      Falls back to reading ~/.netrc when the environment variable is unset.
  • [low] network_egress — src/telemetry.ts:12
      fetch('https://collect.example.com/v1/events', { method: 'POST', body })
      Sends usage events to a host outside the service the tool integrates with.

2 findings reported. These are observations quoted at file:line, not a verdict.
```

Most findings describe the job. A GitHub server reads a GitHub token because
that is what it is for. What the output describes is **what you agree to on
connect**, not intent.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Everything asked about was checked, and nothing was found |
| `1` | Findings were reported |
| `2` | Usage or network error |
| `3` | Something could not be checked |

`0` and `3` are deliberately separate. "Nothing was found" and "nothing was
checked" are different statements, and collapsing them is the exact mistake this
tool exists to prevent. An empty result is **not** a clearance — it means
nothing was found in the categories checked.

## Options

```
--file <path>   read this config instead of ./.mcp.json
--json          print raw JSON instead of a report
--api <url>     point at a different SRI instance
```

`SRI_API` and `SRI_TIMEOUT_MS` are honoured as environment variables.

## Method

An LLM reads the published source under one constraint: report facts, not
verdicts. Every finding must carry a `file:line` and quote the code. The
pipeline drops any finding whose quoted evidence cannot be located in that file,
which removes confident-sounding fabrications. Run-to-run agreement is 93% on a
hand-labelled set of 84 servers.

2,174 registry servers have been read so far. The per-category counts and the
method are published so the numbers can be recomputed rather than trusted:

- Method and raw counts — https://github.com/SRITEST0001/sri/tree/main/research
- Live coverage as JSON — `curl https://sri-test.biz/v1/corpus`

## Also available over MCP

The same corpus is served as an MCP server, published in the official registry
as `biz.sri-test/verifier`:

```json
{ "mcpServers": { "sri": { "type": "http", "url": "https://sri-test.biz/mcp" } } }
```

## If a finding is wrong

There is a form at https://sri-test.biz/contact and it is answered within three
business days. Withdrawn findings stop being served.

## Disclosure

Built and run by the same people who publish the corpus. It is free right now.
Every finding is checkable against the line it came from, so verifying beats
trusting.

MIT
