# The Fairy Tails — Staff Order List

A mobile-first Chrome web app for staff to log items needing ordering, and
for the manager to review and tick them off. The front end is a single static
HTML page (hosted on GitHub Pages). The data lives in a Google Sheet, accessed
via a Google Apps Script Web App that exposes a small JSON API.

```
┌──────────────────────────┐         ┌────────────────────────┐         ┌────────────┐
│  GitHub Pages (static)   │  fetch  │  Apps Script Web App    │  reads  │  Google    │
│  index.html on phones    │ ───────▶│  Code.gs (JSON API)     │ ──────▶│   Sheet    │
└──────────────────────────┘         └────────────────────────┘         └────────────┘
```

## Files in this folder

- `Code.gs` — Apps Script backend (paste into the Apps Script editor).
- `index.html` — the mobile web page (paste-into-Apps-Script *or* host on
  GitHub Pages — the same file works in both modes).
- `SETUP.md` — this guide.

---

## Part 1 — Set up the Google Sheet + Apps Script

1. **Create the Google Sheet.** Go to <https://sheets.new>. Name it
   *Fairy Tails Orders* (any name is fine).
2. **Open the Apps Script editor.** From inside the Sheet, click
   *Extensions → Apps Script*. A new tab opens with a file called `Code.gs`.
3. **Paste the backend code.** Replace everything in the editor with the
   contents of `Code.gs` from this folder. Save with **Ctrl/Cmd + S**.
4. **Run setup once.** With `Code.gs` selected, choose the function
   `setup` from the dropdown next to the Run button, then click **Run**.
   - Google will ask for permissions the first time. Click *Review permissions*,
     pick your account, and on the "Google hasn't verified this app" screen
     click *Advanced → Go to Fairy Tails Orders (unsafe)* and *Allow*. This is
     normal for personal Apps Script projects — you're authorising your own
     script to edit your own Sheet.
   - When it finishes, switch back to the Sheet tab. A new tab named
     **Staff Orders** has been created with the right column headers.
5. **Deploy as a Web App.** Back in the Apps Script editor:
   - Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Description: `Fairy Tails order API` (anything).
   - Execute as: **Me** (your account).
   - Who has access: **Anyone** *(this is required so phones without a
     Google login can call the API; the URL acts as the secret).*
   - Click **Deploy**, authorise again if prompted, then **copy the Web app
     URL** — it looks like
     `https://script.google.com/macros/s/AKfyc.../exec`.
6. **Test the URL.** Paste it into a new browser tab and hit Enter. You should
   see a small JSON response that says `"Fairy Tails Order API is live"`. If
   you see a Google sign-in page, the deployment access setting is wrong —
   redeploy with *Anyone*.

> **Updating later.** If you change `Code.gs`, click *Deploy → Manage
> deployments → pencil → Version: New version → Deploy*. Don't create a brand
> new deployment, or the URL will change and break every phone.

### Mandatory deployment order for this update

Deploy the **backend first**, onto the existing Apps Script deployment, and
verify that a live `getOrders` response contains an `attention` array. Only
after that check passes should `index.html` be published to GitHub Pages. If the
front end is published first, staff phones can briefly use the new page against
an older backend; the page will warn that Needs Attention is unavailable rather
than incorrectly saying that nothing needs attention.

---

## Part 2 — Host the front end (GitHub Pages)

The repo is **<https://github.com/Fairytails123/orderlist>**.

1. **Open `index.html`** from this folder in any text editor.
2. Find the line near the top of the `<script>` block:
   ```js
   const APPS_SCRIPT_URL = ''; // <-- paste your /exec URL here
   ```
   Paste the Web App URL between the quotes and save.

   *Skipping this step is fine* — the page will instead prompt each phone for
   the URL on first load and remember it. But baking the URL in is one fewer
   step for staff.
3. **Upload to the GitHub repo.**
   - Go to <https://github.com/Fairytails123/orderlist>.
   - Click **Add file → Upload files**.
   - Drag `index.html`, `Code.gs` and `SETUP.md` into the upload area.
   - At the bottom, write a commit message (e.g. *Initial app upload*) and
     click **Commit changes**.
4. **Enable GitHub Pages.**
   - In the repo, click **Settings → Pages**.
   - Under "Build and deployment", set **Source** to *Deploy from a branch*.
   - **Branch**: `main`, folder: `/ (root)`. Click **Save**.
   - Wait ~1 minute. The page will show:
     *"Your site is live at https://fairytails123.github.io/orderlist/"*.
5. **Open the live URL on your phone.** That's the URL to share with staff.

---

## Part 3 — Daily use

- **Staff** open the URL on Chrome. First time, it prompts for their initials
  (stored on that phone). They type the item, pick a category, optionally add
  qty/notes, and tap **Add Item**.
- The item appears at the top of the **Order List** tab.
- The **manager** opens the same URL, switches to the **Summary** tab, and
  either taps **Mark ordered**, or uses the red **Reject / flag** action and
  adds a required note explaining the reason. A 5-second Undo toast covers
  slips.
- Flagged items move to the **Needs Attention** tab with the note, flagger and
  automatic removal date visible. From there the manager can send an item back
  to the Order List, edit its note, mark it ordered, or remove it.
- Ordered items disappear from both tabs but stay in the Sheet with a status
  of `Ordered`, so there's a full audit trail. They show up under
  **Recently ordered** for 7 days, with a **Re-add** button to put them back
  on the list with one tap.

### Add to home screen (for app-like feel)

- **Android Chrome:** open the URL, tap the ⋮ menu → *Add to Home screen*.
- **iPhone Safari:** open the URL, tap the share icon → *Add to Home Screen*.

---

## Sheet schema

The `Staff Orders` tab has these columns:

| Column        | Notes                                              |
| ------------- | -------------------------------------------------- |
| Order ID      | `ord_xxxxxxxxxx` — never edit by hand              |
| Date Added    | Timestamp the item was logged                      |
| Item Name     | What was requested                                 |
| Category      | One of the five fixed options                      |
| Quantity      | Optional number                                    |
| Notes         | Optional free text                                 |
| Added By      | Initials of the staff member who added the item    |
| Status        | `Active`, `Ordered`, `Needs Attention` or `Removed` |
| Ordered Date  | Timestamp when marked ordered                      |
| Ordered By    | Initials of the manager who ticked it             |
| Attention Note | Required reason attached when an item is flagged  |
| Attention Date | Timestamp when flagged; starts the retention clock |
| Attention By  | Initials of the manager who flagged it             |
| Removed Date  | Timestamp when manually archived                   |
| Removed By    | Initials of the manager who archived it            |

You can reorder/sort/filter freely in the Sheet — just don't rename columns
or delete the header row, or `Code.gs` will rewrite them on next request.

### Status and retention behaviour

- `Active` items appear on the Order List and Summary.
- `Ordered` items remain in the Sheet and appear under Recently ordered for
  seven days.
- `Needs Attention` items are shown for 30 days from their Attention Date.
  Expiry is a read-side filter evaluated when the app refreshes: it hides an
  item but never deletes or rewrites its Sheet row. Consequently, an expired
  row can still read `Needs Attention` in the Sheet while being hidden in the
  app. Editing the note does not restart the 30-day clock.
- `Removed` means manually archived. The row remains in the Sheet with its
  Removed Date and Removed By values; manual removal never deletes the row.

---

## Troubleshooting

- **"Could not load orders" on the page.** Open the deployed Web App URL in a
  browser tab. If it asks you to sign in, redeploy with *Who has access:
  Anyone*. If it shows JSON, the URL stored on the phone is wrong — open the
  page, tap your initials → *change* → *Change API URL*, and paste again.
- **CORS error in the console.** The page uses `Content-Type: text/plain` to
  avoid the preflight Apps Script can't handle. If you've edited the request
  headers in `index.html`, switch back to text/plain.
- **An item didn't appear.** Tap *Refresh* at the top right of the active
  list — Apps Script can take a moment to write to the Sheet.
- **The Needs Attention tab says "older backend".** Deploy and verify the
  Apps Script backend before publishing or refreshing the GitHub Pages front
  end. Do not treat this warning as an empty Needs Attention list.
- **"You cannot edit this deployment".** Use *Manage deployments → pencil →
  New version* rather than creating a fresh deployment, otherwise the URL
  changes and every phone needs reconfiguring.
- **An attention item is no longer needed.** Use **Remove** in the Needs
  Attention tab. This archives the row as `Removed` and preserves the audit
  trail.
- **Need to wipe the data.** Open the Sheet directly and delete the rows you
  no longer want; the headers will be preserved. The app itself archives rows
  rather than deleting them, so this is the only way to erase data completely.

---

## What's intentionally not included

- No login / per-user accounts. The URL is the secret — share carefully.
- No push notifications. Manager has to open the page (or pin the tab).
- No image attachments. Add via the Notes field if needed (e.g. brand name).
