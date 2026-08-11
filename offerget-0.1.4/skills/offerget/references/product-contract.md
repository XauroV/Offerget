# Offerget product contract

This is the behavioral source of truth for Offerget. Preserve these details when
rebuilding the product or changing the UI. If the implementation and this contract
disagree, keep user data first and report the mismatch.

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

### Review sheet behavior

- The review sheet is an editable confirmation step. Never write a recognized job to
  the library before the user confirms it.
- Recognized values and user-entered values use the same normal text color.
- Preset fallback copy is muted and acts as placeholder text. It must disappear while
  its field is focused, while the field remains editable with a visible caret.
- A preset value must not appear in list or board cards. Show it only as muted placeholder
  copy inside the review sheet.
- Date fields use a date picker and provide an explicit `未知` action. Display unknown
  dates as blank in library views when the field has no confirmed value.
- Partial recognition opens the review sheet without a blocking alert. Failed
  recognition shows a failure message and a manual-entry path.
- A completely failed recognition must never invent a company, title, date, location,
  JD or requirement.
- Closing the sheet discards unconfirmed edits. Confirm-and-save persists the full record.

## Job library

- Support list and board views.
- Search company, title and JD.
- Support broad category tabs such as Product, Design, Operations and Management Trainee.
- Derive one broad category from the title.
- Treat design terms as Design before marketing-related words.
- Keep business domains such as AI and e-commerce out of category tabs.
- Let users enter card keywords manually with commas.

### Home and library layout

- The product name is `Offerget`.
- Keep the light/dark control as a single sun/moon icon at the top edge. Do not add a
  text button or an extra colored tile around it.
- The top intake section uses the title `岗位链接`. Keep the search field, but remove
  the outer decorative frame around the intake section.
- Use the helper copy: `粘贴岗位链接，可一键识别公司、岗位、发布日期、截止日期、JD 与任职要求。`
  Render it as two lines beside the link field.
- Remove the old marketing headline `让你的秋招稳步推进` and the small eyebrow text above
  the library title.
- Place the job search field on the right side of the `岗位库` heading.
- Remove the bottom-right `文案标注` tab.

### List view

- Show company/title, date fields, JD/requirements summary, category, progress and edit
  controls. The application link control has no trailing arrow symbol.
- Hide preset fallback copy from all cells; leave the cell empty when no confirmed value
  exists.
- Hovering the JD/requirements summary opens a readable floating preview of the full text.
- Hovering a long title exposes a small neutral help indicator and the full title. Do not
  use a question-mark cursor; use an ordinary pointer and a normal tooltip/popover.
- Keep the list selection column and its `选择` label.

### Board view

- Cards show a slightly larger company name, a truncated title with an ellipsis, manual
  comma-separated keywords, location, dates, preference control and progress control.
- Hovering a long title opens the full title/details in a popover.
- Board selection mode shows only a checkbox on each card; omit the word `选择`.
- Card-level edit remains available. Clicking the card's original link opens the source page.

### Empty, focus and hover states

- A focused input has a soft blue outline and a visible blinking caret. Avoid a blank,
  caret-less white field when placeholder copy is hidden.
- Hover-only controls must close after any action. For example, cancelling a delete
  confirmation hides the trash icon until the next hover.
- Destructive controls use red text and a red outline on hover. Keep the resting control
  visually quiet.
- Tooltips and popovers must not push the surrounding layout or overflow their card.

## Company grouping

- Allow company grouping to be enabled or disabled.
- Board mode uses one folder per company.
- List mode separates company groups with spacing.
- Create and remove groups automatically from current jobs.
- Store an editable application-rule note for each company.
- Save notes on blank-area click, pencil click or Enter.

### Group notes

- The application-rule note has a small pencil icon.
- Clicking the pencil enters inline editing. Save on blank-area click, a second pencil
  click or Enter, and persist immediately.
- A company group disappears automatically when its last active job is deleted. Restoring
  a job recreates the group.

## Application workflow

- Default progress is Unsubmitted.
- Users can add and delete progress states.
- Deleting a non-empty state requires confirmation.
- Confirmed deletion moves affected jobs to trash.
- Support batch selection, comparison and deletion.
- Keep deleted jobs in trash until permanent clearing.
- Support restore and confirmed trash clearing.
- Save comparison snapshots in comparison history.

### Status and destructive actions

- New status creation uses the inline input chain. Do not use a browser prompt, a plus
  symbol inside the input, or a prominent blue save block.
- Placeholder copy for a new status is `输入状态名称，回车保存`.
- Pressing Enter creates the status and leaves every status unselected by default.
- Status labels have a minimum width matching the existing non-AI labels. Labels longer
  than two Chinese characters may grow up to ten Chinese characters. Reject more than
  ten characters with a clear inline message.
- Hovering a status row reveals a centered trash icon on a light red surface.
- Deleting an empty status asks for confirmation. Deleting a status containing jobs tells
  the user to move those jobs first and offers `取消` or `仍要删除`.
- `取消` cancels the action and clears the hover-only icon. `仍要删除` removes the
  status and its jobs into the recycle bin; never silently migrate them.
- The recycle bin has a `清空记录` action with a confirmation dialog. Restore remains
  available until the user confirms permanent clearing.
- Batch mode supports selecting jobs, comparing them and moving them to the recycle bin.
  A comparison creates a history snapshot that can be opened, deleted individually or
  cleared in bulk.

### Application-progress navigation

- The left progress rail contains `全部` plus every active progress state. Show the
  current count beside each label.
- Selecting a progress state filters the library immediately. `全部` restores the full
  active library and preserves the current list/board mode.
- The default state is `未投递`; adding a job never changes an existing job's state.
- Changing a job's state from a list row, board card or edit sheet updates the count and
  the active filter immediately, then persists to local state.
- A custom state keeps its user-entered name and ordering across reloads and migration.
- Trash jobs do not contribute to progress counts. Restoring a job returns it to the
  progress state stored before deletion.
- When a state is deleted together with its jobs, those jobs enter the recycle bin with
  their original progress value recorded for audit and restore.

### Batch compare and decision history

- The `批量管理` control enters selection mode. Keep the normal library readable while
  showing checkboxes and a compact action bar.
- List mode keeps the `选择` column label. Board mode shows only card checkboxes.
- `对比` requires at least two selected active jobs. With fewer than two, show an inline
  explanation and keep the selection intact.
- The comparison result is a decision snapshot, not a mutation of the jobs. Include each
  selected job's company, title, location, dates, JD, requirements, progress, category,
  manual keywords and reaction.
- Show a side-by-side difference view with missing fields visibly blank. Preserve the
  original text; do not replace it with generated summaries.
- Saving a comparison appends one immutable record to `决策记录` with creation time and
  the selected job IDs plus a copy of the compared values.
- Opening a history record restores the same comparison view even if the live job is later
  edited or moved to trash.
- Each history row can be deleted independently. `全部删除` requires confirmation and
  clears history records only; it never deletes jobs.
- Exiting compare mode returns to the previous library view and clears the current
  selection without changing job data.

## Preference reactions

Each job can be:

- Love
- Can do
- Average
- Neutral

Unselected jobs are excluded from reaction totals. Clicking a summary count filters the corresponding jobs.

### Preference board interaction

- The four reactions are `喜欢`, `能做`, `一般`, `无感`, in that order.
- The default state is the grey neutral icon. An active reaction is a blue icon-sized
  button with white line art.
- Hovering the current icon reveals a compact bar of four icon-sized buttons. The pointer
  can travel from the icon to the bar and click directly; no preliminary click is needed.
- The bar and active button must not overflow the card or leave a duplicate icon behind.
- Clicking a summary card filters the library to matching jobs. Jobs without a reaction
  are excluded from every count and filter.

## Interaction and visual rules

- Use a minimal, tool-like interface with blue as the primary accent.
- Support light and dark themes.
- Keep long board titles truncated and expose the full title on hover.
- Expose complete JD and requirements on hover in list mode.
- Use ordinary pointer and text cursors; avoid the question-mark help cursor.
- Keep placeholders muted and hide placeholder copy from library cards and rows.
- Use the system blue as the only accent family; do not introduce extra accent colors for
  ordinary navigation or selected states.
- Keep the interface tool-like and restrained: no decorative black intake panel, no extra
  headline, no redundant controls.

## Data and privacy

- Store web data in `.offerget/state.json` by default.
- Preserve earlier browser and desktop migration paths.
- Keep user records, backups, logs, environment files and local configuration out of Git.
- Keep the app usable without an OpenAI API key.
- Perform advanced analysis inside Codex when the user invokes the Skill.

## Category rules

- Derive the primary category from the job title only. Do not inspect JD keywords for the
  primary tab.
- Match `设计` terms before any marketing-related term. `品牌创意设计-国际支付` is
  `设计`, never `市场`.
- Match product terms such as `产品经理` and `电商产品` to `产品`.
- Match `管培生` and `产培生` to the single `管培生` category.
- Add categories for title-led roles such as `运营` or `销售` when they appear.
- Business domains such as AI, 电商、直播、金融、国际支付 and 本地生活 stay as manual
  keywords or title text; they must not create tabs.
- Existing stale categories must be migrated when the rule changes. Removing a category
  must not delete jobs without the explicit destructive confirmation described above.

## Removed scope

- Resume library and resume editing
- Automatic card-keyword generation
- Desktop-first distribution
- Automatic use of ChatGPT subscription quota inside the standalone webpage
