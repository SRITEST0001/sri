# SRI — MCP Server Inspector

Read what an MCP server does **before** you connect to it.

Connecting an MCP server hands it a channel into your agent's context and its
tool calls. SRI reads the server's published source and reports what it found —
every observation anchored to a `file:line` with the code quoted verbatim.

**It does not tell you whether a server is safe.** It tells you what the code
does, and shows you the line it read. You decide.

- **Endpoint:** `https://sri-test.biz/mcp` (Streamable HTTP)
- **Corpus:** 2,238 MCP servers from the official registry
- **Price:** free right now — settlement runs on Bitcoin signet, so invoices
  cannot be paid with real funds
- **Findings across the corpus:** [sri-test.biz/research](https://sri-test.biz/research)

## Add it to your client

Remote MCP server, no install, no API key.

```json
{
  "mcpServers": {
    "sri": {
      "type": "http",
      "url": "https://sri-test.biz/mcp"
    }
  }
}
```

<details>
<summary>Claude Code</summary>

```bash
claude mcp add --transport http sri https://sri-test.biz/mcp
```
</details>

<details>
<summary>Anything that speaks Streamable HTTP</summary>

Point it at `https://sri-test.biz/mcp`. There is one tool and no auth.
`GET` on that URL returns 405 — this server does not offer a server-initiated
SSE stream, which the spec permits. Send JSON-RPC over `POST`.
</details>

## The tool

### `check_mcp_server`

| Argument | Required | Meaning |
|---|---|---|
| `name` | yes | Server name as published in the registry, e.g. `io.github.firebase/firebase-mcp` |
| `version` | yes | Exact version, e.g. `1.2.3` |
| `ecosystem` | no | Always `mcp`; other ecosystems are not covered |

Returns a `risk_level`, a summary, and a list of findings. Each finding carries
`location` (`file:line`), `evidence` (the code, quoted), and `why`.

If the server is not in the corpus you get `status: "queued"`, an explicit
"nothing has been checked" — not a clean result — and **no charge**. We do not
bill for an answer we could not give.

## Try it without a client

```bash
curl -X POST https://sri-test.biz/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"check_mcp_server",
                 "arguments":{"name":"io.github.firebase/firebase-mcp","version":"0.3.0"}}}'
```

There is a plain REST endpoint too, if that is easier:

```bash
curl -X POST https://sri-test.biz/v1/verify \
  -H 'Content-Type: application/json' \
  -d '{"ecosystem":"mcp","name":"io.github.firebase/firebase-mcp","version":"0.3.0"}'
```

`GET /v1/price` is open and tells you the current terms.
`GET /v1/docs` is the OpenAPI spec.

## What gets reported

| Category | What it means |
|---|---|
| `credential_access` | Reads environment credentials, tokens, or key files |
| `network_egress` | Sends data to a host outside the package's own service |
| `install_script` | Executes code at install time (`postinstall`, `setup.py`) |
| `prompt_injection_surface` | Tool text or returned data that steers the agent toward actions unrelated to the tool's stated purpose |
| `obfuscation` | Encoded strings decoded and executed |
| `typosquat` | Name close to a well-known package, different publisher |
| `excessive_permission` | Permissions beyond the declared purpose |

Severity is `info` / `low` / `medium` / `high`. `risk_level` is the highest
severity among the findings, derived in code rather than asked for — a verdict
with no findings behind it cannot be published.

## What this is not

- **No finding is not a clean bill of health.** It means nothing was found in
  the categories above, in the code we could fetch.
- **We never label a package malicious, and never call one safe.** The ingest
  step rejects records whose summary contains either kind of claim.
- **MCP servers only.** npm and PyPI libraries are out of scope; ask about one
  and you will get "not analyzed".
- **One analyzer, one pass.** Run-to-run agreement measured at 93% on a
  hand-labelled set of 84 servers before the full corpus was built. Not 100%.

## If a finding is wrong

If you maintain a server and a finding is mistaken, tell us through
**[the report form](https://sri-test.biz/contact)**. Agents can use
`POST /v1/disputes`.

**We reply within three business days.** While we review, the finding may be
withheld from results. If we withdraw it, the server is re-analysed and the
record replaced. If we keep it, we say which facts it rests on.

## Payment

The paid path is [L402](https://docs.lightning.engineering/the-lightning-network/l402)
(Lightning HTTP 402): the server issues an invoice and a macaroon, you pay, and
you present `Authorization: L402 <macaroon>:<preimage>`. Verification is
`sha256(preimage) == payment_hash` — no node required on your side, and no
signup on ours.

**This is switched off today.** Settlement runs on signet, a test chain, so
invoices cannot be paid with real funds and usage is free. When mainnet is
enabled the price returns to $0.20 per cached lookup. `GET /.well-known/l402`
tells you the current state.

## Privacy

We record the path requested, response time, User-Agent, and an **IP hashed
with a daily salt**, kept for 90 days. Raw IP addresses are never stored, and
**request bodies are never stored** — the servers you ask about are recorded by
name, nothing more.
