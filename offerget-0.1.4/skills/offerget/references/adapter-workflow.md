# Recruiting adapter workflow

## Recognition contract

Return these fields:

- `company`
- `title`
- `publishedAt`
- `deadline`
- `location`
- `jd`
- `requirements`
- `recognition.status`: `complete`, `partial`, or `failed`
- `recognition.source`
- `recognition.hostname`

Company, title, JD and requirements determine core completeness. Dates and location can remain editable when a public page does not expose them.

## Discovery order

1. Check `JobPosting` JSON-LD.
2. Inspect public HTML metadata and embedded application state.
3. Identify the recruiting platform from hostname, scripts and page configuration.
4. Inspect public page requests for a job-detail endpoint.
5. Reproduce the smallest read-only request with bounded timeouts.
6. Fall back to visible HTML sections.

Prefer reusable platform adapters. Current coverage includes:

- ByteDance campus
- Alibaba Campus
- Beisen/Zhiye tenant sites
- Moka recruitment sites
- Lever
- Greenhouse
- generic JSON-LD and HTML

Keep tenant branding extraction separate from shared platform requests.

## Unknown-site repair

When a user submits an unsupported public link:

1. Capture the exact failed or partial response.
2. Determine whether the missing data exists in visible HTML, embedded state or a public API.
3. Add a platform-level adapter when the request structure is shared by several companies.
4. Add a company rule only for branding or genuinely unique page structure.
5. Preserve the generic fallback and three recognition states.
6. Add a regression fixture before testing the live URL again.

## Safety boundaries

- Read public job pages only.
- Do not bypass login, CAPTCHA, rate limits or access controls.
- Do not send cookies, credentials, private browser state or user files.
- Do not fabricate missing fields.
- Use bounded responses and timeouts.

## Test requirements

Mock the landing page and public detail API where applicable. Assert:

- correct source
- company and title
- location and dates when available
- non-placeholder JD and requirements
- expected recognition status

Run the focused parser test, then the full suite.
