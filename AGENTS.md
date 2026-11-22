<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Lenden: start here

Read `docs/HANDOFF.md` first (current state, recent changes, standing rules), then `docs/README.md`
for the rest: architecture, data model, feature behaviour, runbook and product decisions.

Non-negotiables:
- Production database = live money. Ask the owner before any production write, migration or delete.
  Localhost uses the same database: block server-action POSTs when clicking through the UI (`docs/runbook.md`).
- Never print or commit secrets (`.env.local`, service role key, Resend key).
- Reply in the owner's language (English, Hindi or Hinglish). Add every UI string in both English and Hindi.
- Before shipping: `tsc` + `eslint`, check at 390×844, push `main`, wait for Vercel `success`.
- When behaviour changes, update the matching `docs/` file and the `HANDOFF.md` recent-changes list in the same commit.
