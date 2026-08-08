# Offerget product contract

## Product goal

Help campus-recruiting candidates collect and manage many real job postings without maintaining a spreadsheet. The primary workflow is local, personal and privacy-preserving. The repository can later be shared as an open-source Codex Skill.

## Job record

Each job stores:

- company
- job title
- published date
- deadline
- location
- original responsibilities
- original requirements
- source URL
- application progress
- broad job category
- manual comma-separated keywords
- preference reaction
- creation and deletion timestamps

All generated values remain editable before and after saving.

## Recognition flow

1. Paste a public job URL.
2. Recognize the page.
3. Open an editable review sheet.
4. Save the confirmed record.

Recognition states:

- `complete`: company, title, JD and requirements were extracted.
- `partial`: some useful fields were extracted; no blocking alert is required.
- `failed`: show a failure prompt and offer manual entry.

Codex should repair unfamiliar public recruiting platforms when the user asks to record a link and recognition remains incomplete.

## Job library

- Support list and board views.
- Search company, title and JD.
- Support broad category tabs such as Product, Design, Operations and Management Trainee.
- Derive one broad category from the title.
- Treat design terms as Design before marketing-related words.
- Keep business domains such as AI and e-commerce out of category tabs.
- Let users enter card keywords manually with commas.

## Company grouping

- Allow company grouping to be enabled or disabled.
- Board mode uses one folder per company.
- List mode separates company groups with spacing.
- Create and remove groups automatically from current jobs.
- Store an editable application-rule note for each company.
- Save notes on blank-area click, pencil click or Enter.

## Application workflow

- Default progress is Unsubmitted.
- Users can add and delete progress states.
- Deleting a non-empty state requires confirmation.
- Confirmed deletion moves affected jobs to trash.
- Support batch selection, comparison and deletion.
- Keep deleted jobs in trash until permanent clearing.
- Support restore and confirmed trash clearing.
- Save comparison snapshots in comparison history.

## Preference reactions

Each job can be:

- Love
- Can do
- Average
- Neutral

Unselected jobs are excluded from reaction totals. Clicking a summary count filters the corresponding jobs.

## Interaction and visual rules

- Use a minimal, tool-like interface with blue as the primary accent.
- Support light and dark themes.
- Keep long board titles truncated and expose the full title on hover.
- Expose complete JD and requirements on hover in list mode.
- Use ordinary pointer and text cursors; avoid the question-mark help cursor.
- Keep placeholders muted and hide placeholder copy from library cards and rows.

## Data and privacy

- Store web data in `.offerget/state.json` by default.
- Preserve earlier browser and desktop migration paths.
- Keep user records, backups, logs, environment files and local configuration out of Git.
- Keep the app usable without an OpenAI API key.
- Perform advanced analysis inside Codex when the user invokes the Skill.

## Removed scope

- Resume library and resume editing
- Automatic card-keyword generation
- Desktop-first distribution
- Automatic use of ChatGPT subscription quota inside the standalone webpage
