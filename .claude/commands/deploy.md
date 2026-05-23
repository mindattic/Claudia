Deploy the Claudia build guide to the FTP server (mindattic.com/claudia/). Run the following command and report the result:

```
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Projects\MindAttic\Claudia\scripts\cli\deploy.ps1"
```

Note: do NOT invoke via `cmd /c "D:/.../deploy.bat"` -- the forward slashes in the path get parsed as cmd switches (cmd uses `/` as its switch prefix), so the command silently opens a fresh shell in the directory and exits without running anything. Call deploy.ps1 directly via PowerShell as shown above.

This pulls subscribed component CSS from the sibling `MindAttic.UIUX` repo into `scripts/cli/build-html.js` (via `sync-claudia.ps1`), rebuilds `Claudia.htm` from `Claudia.md`, stamps it with the current UTC timestamp, clones it byte-for-byte to `index.htm` so `mindattic.com/claudia/` serves the full guide directly (no redirect hop), and FTP-uploads all three files to `/mindattic.com/claudia/`:

- `Claudia.md` — the canonical markdown source
- `Claudia.htm` — the self-contained styled page
- `index.htm` — byte-identical clone of `Claudia.htm`

After running, summarize how many files were uploaded successfully and flag any failures. If the MindAttic.UIUX sync produced a warning (e.g. the sibling repo is missing), surface that too.
