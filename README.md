# Loan Factory Optimizer

A Tampermonkey userscript that streamlines day-to-day work in the Loan Factory portal — turn-time tracking, colour-coded pipelines, one-click copying, and editor conveniences.

> **Personal project.** Not affiliated with, endorsed by, or supported by Loan Factory. Use at your own risk.

---

## Install

**1. Install Tampermonkey**

| Browser | Link |
|---|---|
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tampermonkey/) |

Install **one** copy only. Having both the Chrome-store and Edge-store builds in the same browser causes scripts to silently stop running, because each has its own permissions and storage.

**2. Enable userscripts** *(Chrome and Edge only)*

Chrome and Edge require an extra permission, and **they reset it on browser updates** — so if the script suddenly stops working, check here first.

1. Open `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode**
3. Click **Details** on Tampermonkey
4. Turn on **Allow User Scripts**
5. Set **Site access** to **On all sites**
6. Quit the browser completely and reopen it

**3. Install the script**

Open the raw file — Tampermonkey will show an install page:

**[→ Install loan-factory-optimizer.user.js](../../raw/main/loan-factory-optimizer.user.js)**

Installing from this link is what enables automatic updates. If you paste the code in by hand, updates will not reach you.

---

## Updating

Click the Tampermonkey icon → **Utilities** → **Check for userscript updates**.

Nothing you have configured is lost when updating. Settings live in your browser's storage for loanfactory.com, separate from the script itself.

---

## Features

Everything is configured from the **palette icon** in the Loan Factory top bar.

### Pipeline

- **Row colouring** by loan status, with built-in themes (Classic, Ocean, Pastel, White) and per-status custom colours
- **Borrower name colour** highlighting
- **Copy buttons** beside borrower names, loan numbers, and phone numbers
- **Column sorting** for liabilities and employment
- **Liabilities copier** that skips empty $0/$0 rows
- **Loan Summary pop-out** into its own window, with working copy buttons

### Escalation desk

- **Turn-time SLA** with due dates and a live countdown
  - *Underwriter* — Standard 8h, Rush 5h, Income review 3h
  - *Disclosure Specialist* — 4h flat
  - Counted in business hours only (Mon–Fri, 9:00–18:00)
- **Disclose-due dates** per ticket via a calendar picker, overriding the SLA at 6:00 PM on the chosen date *(Disclosure Specialist only)*
- **Resubmit label** on re-disclosure tickets
- **Assign-time capture** from the audit log, including a bulk update button
- **Sort by turn time**

### Editing

- **Default Text Style** — font, size, bold/italic/underline, colour, highlight, applied as you type, with saveable presets
- **Clean Paste** — strips formatting from pasted text; pictures paste normally
- **Unsaved-note protection** — warns before navigating away from a note you haven't saved
- **Ctrl+Q** applies your saved text style to a selection
- **Phone number formatting** — 10 digits become `(555) 123-4567`

### Other

- **Global search hotkey** — one keystroke to focus the search box
- **Auto-availability** scheduling
- **Auto-navigate to Docs**
- **Auto-collapse sidebar**
- **Backup & Restore** — export every setting to a JSON file
- **System Notices** — optionally auto-dismiss the portal's "WARNING NOTICE" pop-up

---

## Troubleshooting

**The script isn't running at all**

No colours, no copy buttons, no palette icon. Check in this order:

1. Open the browser console (F12) and look for `[LF Optimizer] vX.X.X loaded`. No line means it never ran.
2. **"Allow User Scripts"** in the extension's Details page — Chrome and Edge reset this on updates. This is by far the most common cause.
3. **Quit the browser fully** and reopen. The permission is only re-registered at startup; a page reload is not enough.
4. Check for **two Tampermonkey installs** in the same browser. Compare the extension ID in the dashboard URL against the one on the extensions page — if they differ, the script lives in one install while you configured the other.
5. If the console shows `missing script "<uuid>"`, the install entry is corrupt. **Delete** the script (don't edit it), create a new one, and paste the code fresh.

**A single feature stopped working**

Turn it off and on in the palette panel. If that doesn't help, note the exact page and what you clicked — the console usually logs something useful.

**Settings disappeared**

They're stored per-domain. A different browser profile, or clearing site data for loanfactory.com, wipes them. Use **Export Settings** periodically.

---

## Notes

- Chrome and Edge use Manifest V3, where userscript injection depends on a permission that browser updates reset. Firefox doesn't have this problem, so if the script stops working repeatedly, Firefox is the more stable option.
- The script only reads and modifies pages in your own browser. It sends nothing anywhere and stores nothing outside your browser's local storage.
