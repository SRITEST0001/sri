#!/usr/bin/env node
// SRI — read what an MCP server does before you connect to it.
//
// Deliberately dependency-free. This tool exists to report that other packages
// pull in code you did not read; shipping a dependency tree of our own would
// contradict the product. Node 18+ has global fetch, which is all we need.
// There are no install scripts either, for the same reason.

import { readFile } from 'node:fs/promises'

const API = process.env.SRI_API || 'https://sri-test.biz'
const TIMEOUT_MS = Number(process.env.SRI_TIMEOUT_MS || 20000)
const VERSION = '0.1.0'

// Exit codes are the contract for CI. "Nothing was found" and "nothing was
// checked" MUST NOT share a code — treating unread as clean is the exact
// mistake this tool exists to prevent.
const EXIT_CLEAN = 0
const EXIT_FINDINGS = 1
const EXIT_ERROR = 2
const EXIT_INCOMPLETE = 3

const HELP = `sri-check ${VERSION} — read what an MCP server does before you connect

Usage
  sri-check <name>@<version>       check one server by its registry name
  sri-check <npm-package>          resolve an npm package to a registry entry
  sri-check                        check every server in ./.mcp.json

Options
  --file <path>    read this config instead of ./.mcp.json
  --json           print raw JSON instead of a report
  --api <url>      point at a different SRI instance
  -h, --help       show this
  -v, --version    show version

Exit codes
  0  everything asked about was checked, and nothing was found
  1  findings were reported
  2  usage or network error
  3  something could not be checked — unread is not the same as clean

Findings are observations quoted at file:line, not a safety verdict. An empty
result means nothing was found in the categories checked. It is not a clearance.
`

function fail (msg) {
  process.stderr.write(`sri-check: ${msg}\n`)
  process.exit(EXIT_ERROR)
}

async function getJSON (url, init) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal })
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text } }
    return { status: res.status, body }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`timed out after ${TIMEOUT_MS}ms`)
    throw err
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------------------
// Resolving what to ask about
// ---------------------------------------------------------------------------

// The corpus is keyed by MCP registry name, but a config file names an npm
// package. Resolve so the user does not have to know the mapping.
//
// This does NOT go to the official registry: its search matches server names
// only, so "firebase-tools" returns nothing even though a server declares it as
// its package. The index is kept alongside the corpus instead.
async function resolvePackage (pkg) {
  const q = encodeURIComponent(pkg)
  const { status, body } = await getJSON(`${API}/v1/resolve?package=${q}`)
  if (status >= 400) return { matches: [] }
  return { matches: body.matches || [] }
}

function parseTarget (arg) {
  // "io.github.owner/repo@1.2.3" — split on the LAST @ so scoped npm names
  // like "@scope/pkg" are not mangled.
  const at = arg.lastIndexOf('@')
  if (at > 0) return { name: arg.slice(0, at), version: arg.slice(at + 1) }
  return { name: arg, version: null }
}

async function targetsFromConfig (path) {
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    fail(`could not read ${path} (pass --file, or name a server directly)`)
  }
  let cfg
  try { cfg = JSON.parse(raw) } catch (e) { fail(`${path} is not valid JSON: ${e.message}`) }

  const servers = cfg.mcpServers || cfg.servers || {}
  const out = []
  for (const [label, spec] of Object.entries(servers)) {
    if (spec && typeof spec === 'object' && spec.url) {
      // A remote server is identified only by its URL. We could ask the server
      // itself who it is — but connecting to an unread server is the thing you
      // came here to avoid. Say so instead of quietly doing it.
      out.push({
        label,
        unresolved: 'remote server: identifying it would mean connecting to it first. ' +
                    'Pass its registry name explicitly to check it.'
      })
      continue
    }
    const args = (spec && spec.args) || []
    // npx -y <pkg> / npx <pkg> — the package name is the first non-flag arg.
    const pkg = args.find(a => typeof a === 'string' && !a.startsWith('-'))
    if (!pkg) {
      out.push({ label, unresolved: 'no package name found in this entry' })
      continue
    }
    out.push({ label, pkg })
  }
  return out
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

async function check (name, version) {
  const { status, body } = await getJSON(`${API}/v1/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': `sri-check/${VERSION}` },
    body: JSON.stringify({ ecosystem: 'mcp', name, version })
  })
  if (status === 402) {
    // Free today, not necessarily forever. Do not pretend this is a result.
    return { name, version, status: 'payment_required', detail: body }
  }
  if (status >= 400) {
    return { name, version, status: 'error', detail: body }
  }
  return body
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const BULLET = '  •'

function report (results) {
  const lines = []
  let findings = 0
  let incomplete = 0

  for (const r of results) {
    if (r.unresolved) {
      incomplete++
      lines.push(`? ${r.label}`)
      lines.push(`${BULLET} not checked — ${r.unresolved}`)
      lines.push('')
      continue
    }
    const id = `${r.name}@${r.version}`
    if (r.status === 'queued') {
      incomplete++
      lines.push(`? ${id}`)
      lines.push(`${BULLET} NOT ANALYZED YET. Queued. Nothing has been checked, so`)
      lines.push('    nothing can be said about it either way.')
      lines.push('')
      continue
    }
    if (r.status === 'payment_required') {
      incomplete++
      lines.push(`? ${id}`)
      lines.push(`${BULLET} not checked — payment required. See ${API}/v1/price`)
      lines.push('')
      continue
    }
    if (r.status === 'error') {
      incomplete++
      lines.push(`! ${id}`)
      lines.push(`${BULLET} not checked — ${JSON.stringify(r.detail).slice(0, 160)}`)
      lines.push('')
      continue
    }

    const inferred = r.inferredVersion
      ? '\n      version was not pinned in your config — this is the registry\'s'
        + ' latest, which may not be what you run'
      : ''
    const fs = r.findings || []
    if (!fs.length) {
      lines.push(`- ${id}  (${r.risk_level})${inferred}`)
      lines.push(`${BULLET} nothing found in the categories checked. Not a clearance.`)
      lines.push('')
      continue
    }
    findings += fs.length
    lines.push(`* ${id}  (${r.risk_level}, ${fs.length} finding${fs.length > 1 ? 's' : ''})${inferred}`)
    for (const f of fs) {
      lines.push(`${BULLET} [${f.severity}] ${f.category} — ${f.location || 'location unknown'}`)
      if (f.evidence) lines.push(`      ${String(f.evidence).replace(/\s+/g, ' ').slice(0, 150)}`)
      if (f.why) lines.push(`      ${String(f.why).replace(/\s+/g, ' ').slice(0, 150)}`)
    }
    lines.push('')
  }

  lines.push(findings
    ? `${findings} finding${findings > 1 ? 's' : ''} reported. These are observations quoted at file:line, not a verdict.`
    : 'No findings in the categories checked. That is not a clearance.')
  if (incomplete) {
    lines.push(`${incomplete} target${incomplete > 1 ? 's were' : ' was'} NOT checked. Unread is not the same as clean.`)
  }
  return { text: lines.join('\n'), findings, incomplete }
}

// ---------------------------------------------------------------------------

async function main (argv) {
  const args = []
  let file = '.mcp.json'
  let json = false
  let apiOverride = null

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return EXIT_CLEAN }
    if (a === '-v' || a === '--version') { process.stdout.write(VERSION + '\n'); return EXIT_CLEAN }
    if (a === '--json') { json = true; continue }
    if (a === '--file') { file = argv[++i]; if (!file) fail('--file needs a path'); continue }
    if (a === '--api') { apiOverride = argv[++i]; if (!apiOverride) fail('--api needs a url'); continue }
    if (a.startsWith('-')) fail(`unknown option ${a}`)
    args.push(a)
  }
  if (apiOverride) process.env.SRI_API = apiOverride

  let targets
  if (args.length) {
    targets = args.map(a => ({ label: a, ...parseTarget(a) }))
  } else {
    targets = await targetsFromConfig(file)
    if (!targets.length) {
      process.stderr.write(`sri-check: no MCP servers found in ${file}\n`)
      return EXIT_CLEAN
    }
  }

  const results = []
  for (const t of targets) {
    if (t.unresolved) { results.push(t); continue }
    let { name, version } = t
    let inferredVersion = false
    // No version given, or a package name from a config file: resolve it.
    if (!version || t.pkg) {
      const key = t.pkg || name
      let matches = []
      try { ({ matches } = await resolvePackage(key)) } catch { /* fall through */ }
      if (matches.length > 1) {
        // Do not guess. Reporting another server's findings as this one's is
        // worse than saying we do not know which it is.
        results.push({
          label: t.label || key,
          unresolved: `"${key}" is claimed by ${matches.length} registry entries ` +
                      `(${matches.slice(0, 3).map(m => m.server_name).join(', ')}). ` +
                      'Pass the one you installed as <registry-name>@<version>.'
        })
        continue
      }
      if (matches.length === 1) {
        name = matches[0].server_name
        // The index holds the registry's latest version. A config file that
        // does not pin a version tells us nothing about what is actually
        // installed, so the result below may describe a different release.
        // Say which version was read rather than implying it is yours.
        if (!version) inferredVersion = true
        version = version || matches[0].version
      } else if (!version) {
        results.push({
          label: t.label || key,
          unresolved: `could not map "${key}" to a registry entry. ` +
                      'Pass <registry-name>@<version> directly.'
        })
        continue
      }
    }
    try {
      results.push({ ...(await check(name, version)), inferredVersion })
    } catch (err) {
      results.push({ name, version, status: 'error', detail: String(err.message || err) })
    }
  }

  const { text, findings, incomplete } = report(results)
  process.stdout.write(json
    ? JSON.stringify(results, null, 2) + '\n'
    : text + '\n')

  if (findings) return EXIT_FINDINGS
  if (incomplete) return EXIT_INCOMPLETE
  return EXIT_CLEAN
}

main(process.argv.slice(2))
  .then(code => process.exit(code))
  .catch(err => fail(err && err.message ? err.message : String(err)))
