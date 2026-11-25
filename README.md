# Fieldbook Notebook for Obsidian

Fieldbook 0.1.3 is a TypeDraw-inspired, non-desktop-only prototype built to the Fieldbook v2 mockup. It is a separate Obsidian plugin; it does not change or depend on FJG File Focus, Vault Control Center, Objectives, or Excalidraw.

## Use

Use the small floating **•••** button to show Contents, Saved pages, Appearance, layout, folder, and other tools. The menu closes after choosing an item or tapping outside. Previous and next remain directly accessible next to it. No permanent toolbar rows take space away from the paper.

Open **Fieldbook Notebook: Open Fieldbook** from the command palette or use the ribbon book icon. Tap the cover, then **••• → New page** to add an actual Markdown page. No notes are created just by opening the view. For a different notebook folder, close Fieldbook first and use its community-plugin settings. The default folder is `Fieldbook Notebook`. Use a new folder for the first trial.

- **Existing notes:** Tap **••• → Choose folder** (or run **Fieldbook Notebook: Choose folder**) to view Markdown notes in a selected vault folder and its subfolders. Contents lists them as pages. They stay read-only in Fieldbook; use ↗ to open an original in normal Obsidian. To return to writing pages, choose **Fieldbook notebook (create and edit pages)** in the folder picker. Folder view skips Excalidraw files and Fieldbook data.
- **Layout:** Tap **1 Page** for a full-width single page even when unfolded; **Auto** brings back the spread on wide panes. Fieldbook keeps its controls above the mobile dock where the dock overlaps the view. The native Obsidian and iOS chrome stay intact. Single full-width page in a narrow or portrait-shaped view. Wide views show a facing page or contents next to the active page. This measures the Obsidian pane, not an OS hinge sensor.
- **Navigation:** Contents shows pages and headings. Star a page, then use **Saved** to return. The numbered next/previous controls never create a page. **New page** appends one new Markdown page. The experimental edge turn can be enabled in Appearance; it is off by default and works only in Read mode. Page changes use a short transition, not a physical paper curl.
- **Writing:** Tap **••• → Type** for the title or Markdown body. Use Checklist, List, or Heading to add Markdown syntax. **Done** dismisses typing. The ↗ button opens the same note in normal Obsidian.
- **Marks:** In Type mode select text and open **••• → Text marks**. Pick highlight, underline, circle or strike. Marks are separate from Markdown and track text edits and wrapping. For an uncertain external edit, open **••• → Text marks** to reattach to a new selection or discard. There is no automatic draw-to-mark recognition.
- **Appearance:** View cover title/label, reopening choice, paper, ruling, ink, typeface, size, and swipe settings. Changes preview immediately; tap **Save** to persist them or **Cancel** to revert.

## Data and recovery

Pages are ordinary Markdown in the notebook's `Pages/` folder. Stable page IDs, rather than filenames, identify bookmarks and annotations. Bookmarks and style are saved in `Fieldbook Data/Notebook.md`; per-page marks are stored as companion Markdown records in the same folder so they can travel with the notes. These companions may appear in vault search. Extra Obsidian properties on companion files are preserved. An unrecognized settings file is left untouched and does not block folder reading. No network calls, permissions, or telemetry are part of the plugin.

Edits to unrelated frontmatter on a managed page no longer block a compatible save; Fieldbook preserves them. When Fieldbook detects it would overwrite an outside text edit, it keeps the draft open instead. Use **Copy draft**, then explicitly reload when ready. If a conflicted tab is closed, Fieldbook tries to keep the Markdown draft in device-local app storage; use **Fieldbook Notebook: Copy Fieldbook recovery drafts**. Do not clear the app's data while recovering it. Physical-device sync behavior is not yet verified; test changes in a disposable notebook first.

## Install with BRAT

1. In Obsidian, open **Settings → Community plugins → BRAT**.
2. Choose **Add beta plugin** and paste `https://github.com/jajuangarrett-ctrl/fieldbook-notebook`.
3. Choose **Latest version** if prompted and enable **Fieldbook Notebook**. Open **Fieldbook Notebook: Open Fieldbook** from the command palette.

On mobile, BRAT and community plugins must be enabled on that device. This is an early test build. Start in a disposable notebook before using real notes.

## Build and local install

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:host
```

Browser tests use a temporary localhost fixture, Microsoft Edge on macOS by default, and a disposable file-store stand-in. Set `BROWSER_BIN` to a Chromium-compatible executable to use another browser. The host smoke test starts Obsidian only with a temporary profile and vault, exercises the installed command, and checks the resulting note. Set `OBSIDIAN_BIN` to override the desktop executable path.

To install manually, extract the packaged `fieldbook-notebook/` folder under the target vault's `.obsidian/plugins/`. It must contain `manifest.json`, `main.js` and `styles.css` directly. Reopen Obsidian, enable **Fieldbook Notebook** in Community plugins, then run **Open Fieldbook**. Do not replace another FJG plugin. For exact device behavior, test it in Obsidian on the physical Duo.

## Not in this build

True paper curl, freehand ink and variable-pressure Pencil validation, photo positioning gestures, automatic drawn-mark detection, and MyScript/Nebo handwriting recognition. The latest verified scope and test results are in the vault build notes.

Page arrows (and the optional reading edge swipe) turn the active paper leaf in 3D in both single-page and automatic spread layouts. Reduced Motion skips the effect. Contents and bookmark jumps open directly.

**Table of contents** on the cover, the floating **Home** button on any page, or **Contents** in Notebook tools all open a full-page index. Tap a note or one of its headings to open it in Fieldbook.
