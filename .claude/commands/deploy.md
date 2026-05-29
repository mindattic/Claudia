Deploy the Claudia landing page (`mindattic.com/claudia.htm`) via **MindAttic.Deploy** (sibling repo at `D:\Projects\MindAttic\MindAttic.Deploy`).

This now uses the standard catalog pipeline: `README.md` is rendered through `template/index.template.htm` with the `Hardware` theme and FTPS-uploaded as a single file. The old 3-file long-form-guide pipeline (`scripts/cli/deploy.ps1` + marker-block splicing + `/claudia/` subfolder) is retired.

Run this command and report the result:

```
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd D:\Projects\MindAttic\MindAttic.Deploy; npm run deploy -- --only claudia"
```

It will:

1. Render `D:\Projects\MindAttic\Claudia\README.md` through the catalog template (Hardware theme, MindAttic.UIUX components loaded via jsDelivr).
2. FTPS-upload `out/claudia.htm` to `/mindattic.com/claudia.htm`.

After running, summarize the result and flag any failures.

Notes:
- Catalog entry: `MindAttic.Deploy/projects.json` -> `projects[]` slug `claudia` (theme: Hardware).
- Credentials: `MindAttic.Deploy/secrets/ftp.json` (gitignored).
- Old subfolder URL `mindattic.com/claudia/` still exists on the FTP server until you manually delete it.
