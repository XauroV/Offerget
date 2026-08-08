---
name: offerget
description: Run and maintain the Offerget local campus-recruiting tracker. Use when Codex needs to start Offerget, record a public job URL, diagnose partial or failed recognition, add a reusable adapter for an unfamiliar recruiting platform, preserve or migrate local job data, or modify Offerget job-library behavior.
---

# Offerget

Preserve user data and existing records throughout every workflow.

## Resolve the repository

Find the Offerget repository in this order:

1. Use `OFFERGET_REPO` when set.
2. Read `references/repo-path.txt` when this Skill was installed by the repository installer.
3. Use the repository two directories above this Skill when `package.json` has `productName: "offerget"`.
4. Ask for the cloned repository path when no candidate is valid.

From a repository checkout, run `node skills/offerget/scripts/doctor.mjs` to inspect the resolved repository, supported Node version, local state file and running server. When the Skill is installed elsewhere, invoke the same script from the installed Skill directory.

## Start Offerget

1. Require Node.js `>=22.13.0`.
2. Run `npm install` only when dependencies are absent and request permission before downloading packages.
3. Run `npm run dev -- -p 3001` for development.
4. Use the repository `scripts/start-job-tracker.ps1` for a persistent Windows browser session.
5. Open the reported local URL.

Keep web data in `.offerget/state.json` or the directory selected by `OFFERGET_DATA_DIR`.

## Record a job URL

1. Ensure Offerget is running.
2. Run `node skills/offerget/scripts/check-recognition.mjs <url> [base-url]` from the repository, or invoke the installed Skill copy.
3. Treat `complete` as ready for user review.
4. Open the editable review form for `partial`.
5. For `failed`, show the manual-entry path and continue with adapter repair when the user asked to record the URL.
6. Never fabricate company, title, dates, location, responsibilities or requirements.

## Repair unfamiliar recruiting sites

Read [references/adapter-workflow.md](references/adapter-workflow.md).

1. Reproduce the public response.
2. Identify the shared recruiting platform before adding a company-specific rule.
3. Prefer JSON-LD, embedded public state, public detail APIs and visible HTML in that order.
4. Add or update the adapter in `app/api/analyze-job/route.ts`.
5. Add a mocked regression case to `tests/rendered-html.test.mjs`.
6. Run the focused test, then the full test suite.
7. Recheck the real URL and report extracted fields and recognition state.

Stop at login, CAPTCHA, authorization or access-control boundaries.

## Preserve data

- Never delete `.offerget/state.json`, a desktop SQLite database or a user backup.
- Keep local data, `.env.local`, logs and generated archives outside Git.
- Preserve jobs, statuses, trash, comparisons, theme, reactions, company notes and manual keywords during migrations.
- Use `skills/offerget/scripts/export-desktop-state.cjs` only for read-only legacy SQLite export.

## Maintain product behavior

Read [references/product-contract.md](references/product-contract.md) before changing fields, classification, grouping, deletion, comparison, reactions or persistence.

Keep broad job categories title-based. Keep card keywords manual and comma-separated. Verify both list and board views after UI changes.

## Validate

Run the smallest relevant test first, then:

```bash
npm test
```

For release preparation, verify `.gitignore`, inspect the archive contents and confirm that no user data or generated build directory is included.
