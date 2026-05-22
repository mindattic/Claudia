Deploy the Claudia build guide to the FTP server (mindattic.com/claudia/). Run the following command and report the result:

```
cmd /c "D:/Projects/MindAttic/Claudia/scripts/cli/deploy.bat"
```

This pulls subscribed component CSS from the sibling `MindAttic.Components` repo into `scripts/cli/build-html.js` (via `sync-claudia.ps1`), rebuilds `Claudia.htm` from `Claudia.md`, stamps it with the current UTC timestamp, clones it byte-for-byte to `index.htm` so `mindattic.com/claudia/` serves the full guide directly (no redirect hop), and FTP-uploads all three files to `/mindattic.com/claudia/`:

- `Claudia.md` — the canonical markdown source
- `Claudia.htm` — the self-contained styled page
- `index.htm` — byte-identical clone of `Claudia.htm`

After running, summarize how many files were uploaded successfully and flag any failures. If the MindAttic.Components sync produced a warning (e.g. the sibling repo is missing), surface that too.
