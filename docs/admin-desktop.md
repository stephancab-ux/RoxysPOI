# Roxys Admin — desktop app guide

The admin runs as an app **on your own computer**. Your master list of points is
a file **you** keep — it never goes on the internet. Only the client viewer (the
map your travelers open from your email) stays online.

This guide covers: installing the app, getting past the first-run security
warning, and setting up the Google Drive / OneDrive file so you can work from
both your computers.

---

## 1. Install the app

1. Go to the project's **Releases** page on GitHub.
2. Download the file for your computer:
   - **Windows** → the `.exe` (or `.msi`) installer.
   - **Mac** → the `.dmg`.
3. Open it and install like any app.

### First time you open it — the "unknown developer" warning

The app is **free and unsigned**, so your computer shows a one-time warning. This
is expected. To open it:

- **Windows** — "Windows protected your PC": click **More info → Run anyway**.
- **Mac** — "cannot be opened because it is from an unidentified developer":
  **right-click (or Control-click) the app → Open → Open**. You only do this once.

---

## 2. Set up your master list on Google Drive / OneDrive

Your points live in a single file. Keep that file inside a folder that Google
Drive or OneDrive syncs, and it will travel between your computers automatically.

**On your first computer:**

1. Make sure Google Drive or OneDrive is installed and signed in, and you have a
   synced folder (e.g. `OneDrive/Roxys`).
2. Open **Roxys Admin**. On the welcome screen choose:
   - **Start a new list** — pick a place inside your Drive folder and a name
     (e.g. `OneDrive/Roxys/master.json`). You begin with the default categories.
   - or **Open existing list…** — if you already have a `master.json`.
3. Add/import your points. When you're done, click **Save** (top right, or in the
   **Master data** tab).

**On your second computer:**

1. Install Roxys Admin and make sure the **same** Drive folder is synced there.
2. Open the app → **Open existing list…** → choose the same file from your Drive
   folder. Set this **once per computer**.
3. Edit, then **Save**.

> You only pick the file location **once per computer**. After that the app
> remembers it and loads it automatically when you open the app.

---

## 3. Switching between computers safely

Because the file syncs through the cloud, there's one simple rule:

> **Wait for the drive's "synced ✓" before switching computers.**

- After you **Save** on computer A, wait until Google Drive / OneDrive shows the
  file as fully uploaded (a green check / "up to date").
- Then on computer B, open the app (it reloads the latest file automatically) or
  use **Master data → Reload from disk** to pull the newest version before you
  start editing.

**Backups:** every time you Save, the app also drops a dated copy in a `backups`
folder next to your file (e.g. `backups/roxys-master-20260623-1430.json`). If a
sync mix-up ever overwrites something, open a backup with **Open existing list…**
to roll back.

**Unsaved changes:** if you try to close the app with unsaved edits, it asks
whether to **Save & close**, **Close without saving**, or **Cancel**.

---

## 4. Day-to-day

- Edit points / categories / texts as before.
- Generate per-client files from the **Client file** tab and email them — these
  still open in the online client viewer.
- Click **Save** when you're done. That's it.

Your points stay on your computer and your private Drive. Nothing about your
master list is published online.
