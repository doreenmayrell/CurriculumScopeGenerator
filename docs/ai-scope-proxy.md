# Real scope analysis (local Claude proxy)

The **Run Scope** screen calls Claude for real via a small local Node/Express proxy
that holds the Anthropic API key **server-side**. The browser never sees the key — it
posts to `/api/scope`, the proxy calls Claude, and returns the result in the exact
shape the result screen renders.

```
Browser (Run Scope)  →  /api/scope (Vite dev proxy)  →  Node proxy :8787  →  Anthropic API
                                                          holds ANTHROPIC_API_KEY (.env)
```

- Proxy: [`server/index.js`](../server/index.js) — `claude-opus-4-8`, adaptive thinking,
  streaming, structured-JSON output enforced against the result schema.
- The improved cross-standard-set prompt (catches TEKS-only gaps like counting backward /
  one-more-one-less) lives in that file's `SYSTEM_PROMPT`. See [scope-prompt.md](scope-prompt.md).

## Setup

1. Put your key in `.env` (it is gitignored):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   > ⚠️ If you pasted a key into chat, it is compromised — rotate it at
   > [console.anthropic.com](https://console.anthropic.com/settings/keys) and use the new one here.

2. Run web + proxy together:

   ```
   npm run dev:all
   ```

   …or in two terminals: `npm run dev` (web on :5173) and `npm run server` (proxy on :8787).
   Vite proxies `/api` → `:8787`, so the browser stays same-origin.

## Use it

Open a workspace → **Run Scope** → name the new standard system, attach its PDF, **Run
scope analysis**. The proxy sends the PDF to Claude and the result renders on the Scope
Result screen. Errors (missing key, rate limit, bad key) surface as a red note under the
button and as a toast.

## Notes / limits

- **Key never reaches the browser** — it's read from `.env` by the Node process only.
- The lesson library (if built) is sent for the coverage audit; turn on **"No CCSS lessons
  exist yet"** in the workspace to skip the audit and only surface new-standard gaps.
- `GET /api/health` → `{ ok, model, hasKey }` is a quick way to confirm the key loaded.
- If the proxy isn't running, Run Scope shows a connection error; the rest of the app
  (library import, lesson views, export) works without it. Demo runs from history still
  render the bundled sample fixtures.
- Cost: each run is one Claude call (PDF input + structured output). Use a workspace with a
  small standards PDF while iterating.
