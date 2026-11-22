# Runbook: run, verify, ship

## Local

- Node comes from mise (`mise.toml`). If `node` is not on PATH: `export PATH=$HOME/.local/share/mise/installs/node/22.23.3/bin:$PATH`.
- `npm run dev` serves http://localhost:4000. Agents in the desktop app start it with the preview tool (config `lenden-dev` in `/Users/ani/Documents/.claude/launch.json`, one level above the repo), not Bash.
- `.env.local` holds the Supabase URL and publishable key, `SUPABASE_SERVICE_ROLE_KEY` and `APP_BASE_URL`. Resend keys are only in Vercel. The file is gitignored; never print it.
- **Localhost talks to the production database.** There is no separate dev database.

## Verify before shipping

```bash
./node_modules/.bin/tsc --noEmit -p .
./node_modules/.bin/eslint src --quiet
```

(ESLint prints a harmless note that `app-shell.tsx` is over 500 KB.)

**UI check:** a 390×844 viewport, business URL `http://localhost:4000/b/margdarshakssproduction-123?tab=…`.

**Never let a UI test write to production by accident.** Before clicking any submit, patch fetch in the page so server actions hang (or fail) instead of running:

```js
const f = window.fetch; window.__actions = [];
window.fetch = function (input, init) {
  const h = new Headers(init?.headers || {});
  if ((init?.method || "GET").toUpperCase() === "POST" && h.has("next-action")) {
    window.__actions.push(Object.fromEntries([...(init.body instanceof FormData ? init.body.entries() : [])]));
    return new Promise(() => {});  // or reject(new TypeError("Failed to fetch")) to test the error toast
  }
  return f.apply(this, arguments);
};
```

This shows the spinner and overlay, and `window.__actions` shows exactly what would have been sent.

Other tricks:
- **Logic:** copy pure functions (date and dues math, message builders) into a scratch `.ts` file, compile with `tsc`, and run with `node`.
- **SQL:** test inside `begin … rollback` (see `data-model.md`).
- **Fake data:** intercept GET responses in the page and inject fields, for example `overstay_days`, to see UI states without changing the database.
- Keep the browser pane visible while timing pages; a hidden pane throttles them.
- **Debugging a failed action:** check the Supabase API logs (`edge_logs`) for the REST call and its status. A 403 on INSERT usually means a missing RLS policy.

## Ship

1. Commit on `main`. The message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` when an agent wrote the change.
2. `git push origin main`.
3. Wait for Vercel:
   ```bash
   repo=$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')
   curl -s https://api.github.com/repos/$repo/commits/$(git rev-parse HEAD)/status | grep -m1 '"state"'
   ```
   Repeat until the state is `success`. On `failure`, check the Vercel deployment logs.
4. If the change needs a migration, apply it **before** the push that depends on it, and only with the owner's approval.

## Safety checklist

- [ ] No writes to production rows without asking (payments, expenses, ledger, students).
- [ ] No migration without asking.
- [ ] No secret printed in chat or committed.
- [ ] Both English and Hindi strings added.
- [ ] Docs updated (`HANDOFF.md` recent changes, plus the feature file).
