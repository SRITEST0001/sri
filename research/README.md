# What 2,174 MCP servers do

We fetched the published source of every package-type server in the official MCP
registry and read it. This document is the numbers and the method. The raw
counts are in [`findings-by-segment.csv`](./findings-by-segment.csv) so you can
recompute anything here.

## Method

1. Pulled every entry from the official MCP registry, kept the latest version of
   each package-type server.
2. Fetched the published source from npm. **2,238 servers.**
3. For **64** we could retrieve only metadata and documentation — no
   implementation. Those are recorded as **not judged**, not as clean. Every
   percentage below is over the **2,174 we actually read**.
4. Each server was read by an LLM under one constraint: **report facts, not
   verdicts.** Every finding must carry a `file:line` and quote the code.
5. The pipeline drops any finding whose quoted evidence cannot be located in
   the file. If we cannot point at it, we do not report it.

Run-to-run agreement was **93%** on a hand-labelled set of 84 servers, measured
before the full corpus was built.

Servers were ranked by npm weekly downloads at time of collection. The
"no download signal" group was sampled *before* we ranked by downloads, so it is
closer to a random draw from the registry than to a "least popular" bucket.

### All servers

n = 2174 servers judged

| Category | Servers | Share |
|---|---:|---:|
| `credential_access` | 438 | 20.1% |
| `network_egress` | 204 | 9.4% |
| `prompt_injection_surface` | 174 | 8.0% |
| `install_script` | 172 | 7.9% |
| `other` | 85 | 3.9% |
| `excessive_permission` | 15 | 0.7% |
| `obfuscation` | 3 | 0.1% |

### Popular — 1,000+ downloads/week

n = 252 servers judged

| Category | Servers | Share |
|---|---:|---:|
| `credential_access` | 33 | 13.1% |
| `install_script` | 26 | 10.3% |
| `network_egress` | 20 | 7.9% |
| `prompt_injection_surface` | 5 | 2.0% |
| `excessive_permission` | 2 | 0.8% |
| `other` | 1 | 0.4% |

### Long tail — 1–999 downloads/week

n = 661 servers judged

| Category | Servers | Share |
|---|---:|---:|
| `credential_access` | 73 | 11.0% |
| `network_egress` | 42 | 6.4% |
| `prompt_injection_surface` | 26 | 3.9% |
| `install_script` | 26 | 3.9% |
| `other` | 6 | 0.9% |
| `excessive_permission` | 4 | 0.6% |

### No download signal

n = 1261 servers judged

| Category | Servers | Share |
|---|---:|---:|
| `credential_access` | 332 | 26.3% |
| `prompt_injection_surface` | 143 | 11.3% |
| `network_egress` | 142 | 11.3% |
| `install_script` | 120 | 9.5% |
| `other` | 78 | 6.2% |
| `excessive_permission` | 9 | 0.7% |
| `obfuscation` | 3 | 0.2% |

## Reading these numbers

**Most of this is ordinary and intended.** A GitHub server reads a GitHub token
because that is the job. `credential_access` is not an accusation — it is a
description of what you agree to when you connect a server.

**The popularity split is not a controlled comparison.** The three groups were
selected differently. Do not read "popular means safe" into it: install-time
execution is *more* common among popular servers (10.3%) than in the long tail
(3.9%).

**No finding is not a clean bill of health.** It means nothing was found in the
categories above, in the code we could fetch.

## Categories

| Category | What it means |
|---|---|
| `credential_access` | Reads environment credentials, tokens, or key files |
| `network_egress` | Sends data to a host outside the package's own service |
| `install_script` | Executes code at install time (`postinstall`, `setup.py`) |
| `prompt_injection_surface` | Tool text or returned data that steers the agent toward actions unrelated to the tool's stated purpose |
| `obfuscation` | Encoded strings decoded and executed |
| `excessive_permission` | Permissions beyond the declared purpose |
| `other` | Recorded, but outside the categories above |

A server can appear in several categories; percentages are shares of servers
with at least one finding in that category, not shares of findings.

## Recomputing these numbers

The counts in this directory are a snapshot. The live figures are served as
JSON, free and without a key, so you can recompute rather than trust the CSV:

```bash
curl https://sri-test.biz/v1/corpus
```

That returns coverage totals and the per-category shares. To see which servers
were read — names and versions only, no findings — page through the index:

```bash
curl 'https://sri-test.biz/v1/corpus/index?limit=100'
```

Follow `next_cursor` until it comes back `null`. Presence in the index means the
source was read; it carries no verdict. Absence means not yet read, which is not
the same as clean.

## Checking a specific server

The corpus is queryable, free, no key:

```bash
curl -X POST https://sri-test.biz/v1/verify \
  -H 'Content-Type: application/json' \
  -d '{"ecosystem":"mcp","name":"io.github.firebase/firebase-mcp","version":"0.3.0"}'
```

Every finding comes back with the `file:line` and the quoted code, so you can
check the claim rather than trust it.

## If a finding is wrong

Tell us through [the report form](https://sri-test.biz/contact). We reply within
three business days. While we review, the finding may be withheld from results.
If we withdraw it, the server is re-analysed and the record replaced. If we keep
it, we say which facts it rests on.

---

Corpus analyzed August 2026 with Claude Haiku 4.5. Download counts are npm
weekly figures at time of ranking.
