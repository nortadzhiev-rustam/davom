# Davom

An offline follow-up tracker (a digital *çetele*). *Davom* means "keep going" in Uzbek and Tajik (Turkish *devam*). An admin decides what to track, such as pages read, minutes of exercise or yes/no habits, and sets weekly goals. Members fill in their week, and the admin sees reports, rankings and history.

Everything runs on one computer. No internet, no account, no cloud.

## Features

- **Admin-defined items.** Each item is a number (with a unit such as pages or minutes) or a yes/no tick. It is entered every day or once a week, can have a suggested weekly goal and optional points, and can be limited to certain groups.
- **Personal goals.** Every member sets their own weekly goal for each item. The admin's suggestion is the starting value, and the admin can see and adjust any member's goals. A change counts from the current week on, so past weeks keep the goals they had. Completion, reports and exports all use each member's own goal.
- **Fill-in day.** The admin picks a weekday. On that day members see a reminder and the sheet opens on the week that is due. Afterwards, members whose due sheet is still empty get a reminder, and the dashboard lists who hasn't filled it in. It never locks anything.
- **Members and groups.** Add members one by one or paste a list. A member can have an optional 4–8 digit PIN.
- **Weekly sheet.** A grid of days × items with autosave. On phones it switches to a day-by-day view.
- **Admin "Fill in" page.** Enter numbers for any member and any week, for example when people hand in paper sheets. Enter moves to the next row, and next/previous member buttons keep the same week.
- **Reports.** Pick a week, a month or any date range. Filter by group, sort by any column, and export CSV (summary or every entry). Reports print cleanly on A4 landscape.
- **Dashboard.** Average completion, who hasn't filled in the due week yet, top members, per-item totals and an 8-week trend.
- **Member history.** Each member's last 8/12/26 weeks, as a chart and a table.
- **Optional local network mode.** Members can fill in from their phones over the same Wi-Fi (still no internet). There's a QR code to open it, and by default the admin panel only opens on the main computer.
- **Backups.** An automatic daily snapshot of the database (the last 30 are kept), plus a portable backup file you can download and restore.
- **Languages and themes.** English, Türkçe, O'zbekcha and Тоҷикӣ (Tajik), in light or dark mode.

## Where the data lives

All data is in one SQLite database, `davom.db`, with a `backups/` folder next to it:

- **Windows:** `%APPDATA%\Davom\`
- **macOS:** `~/Library/Application Support/Davom/`

SQLite comes built into Electron (`node:sqlite`), so there are no native modules to compile and both installers build from one machine.

- **Tables:** `settings`, `member_groups`, `members`, `items`, `item_groups`, `entries` (one row per member, day and item) and `goals` (each member's goal history). Every change is written in its own transaction.
- **Automatic backups:** once a day the app writes a consistent copy of the database to `backups/davom-<date>.db`. To recover, quit the app and copy one of them over `davom.db`.
- **Manual backups:** *Settings → Backup* downloads a portable JSON file, and *Restore* loads one back.
- **Looking inside:** quit the app, then open `davom.db` in any SQLite tool, such as DB Browser for SQLite. While the app runs you'll also see `davom.db-wal` and `davom.db-shm`; those belong to the database, so quit the app before copying it by hand.
- **Older versions:** data from versions that stored `davom-data.json` is imported automatically the first time this version starts, and the old file is renamed to `davom-data.json.imported`.

To keep the data somewhere else (a USB stick, a shared folder), start the app with the environment variable `DAVOM_DATA` set to that folder.

## Development

Requires Node.js 18 or newer.

```bash
npm install
npm start        # run the desktop app
npm run dev      # or: run only the local server, then open http://127.0.0.1:4870 in a browser (data in ./dev-data)
```

Project layout:

```
main.js            Electron entry: starts the local server and opens the window
server/            Local HTTP server, SQLite storage, auth, reports (plain Node, no framework)
public/            The web UI (Preact + htm, vendored, no build step)
build/icon.png     App icon (regenerate with: npm run icon)
```

## Building installers

```bash
npm run dist:mac   # dist/Davom-1.0.0-mac-arm64.dmg (Apple Silicon)
npm run dist:win   # dist/Davom-Setup-1.0.0.exe (Windows 64-bit installer)
npm run dist       # both
```

The build steps download Electron once and need internet. The finished app never does.

For Intel Macs, change `"arch": ["arm64"]` to `["arm64", "x64"]` (or `["universal"]`) under `build.mac.target` in `package.json`.

### First launch on other computers (unsigned app)

The installers are not code-signed, so each OS shows a one-time warning:

- **Windows (SmartScreen):** click **More info → Run anyway**.
- **macOS:** open the DMG and drag Davom to Applications. The first time, right-click the app and choose **Open**. On newer macOS versions you may instead need **System Settings → Privacy & Security → Open Anyway**.

To remove these warnings you need a code-signing certificate: an Apple Developer ID (with notarization) and a Windows code-signing certificate. Both are configured in the `build` section of `package.json`.

## Local network mode

Turn it on under **Settings → Local network**. The app then listens on the computer's local IP address (port 4870 by default) and shows the address and a QR code. Phones on the same Wi-Fi open that address in a browser. The first time, Windows asks whether to allow the app on the network; choose **Allow** for private networks.

Members sign in with their name (and PIN, if set). Admin sign-in from other devices is off unless you enable it.
