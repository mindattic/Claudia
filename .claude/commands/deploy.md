# /deploy -- no web deploy

**Claudia has no web deploy.** Its README on GitHub -- https://github.com/mindattic/Claudia -- is the project page. To update the project page, edit `README.md` and push to `main`.

The README-driven landing page `mindattic.com/claudia.htm` was retired together with MindAttic.Deploy's catalog mode (amendment DEP-A6 in `MindAttic.Deploy/docs/AMENDMENTS.md`, 2026-10-03). `npm run deploy -- --only claudia` is now rejected, so do not run MindAttic.Deploy for this project.

Note: the interactive parts configurator / cost calculator (`config/parts.json` filling the `<!-- CONFIG-WIDGET -->`, `<!-- PARTS-GALLERY -->` and `<!-- when: ... -->` markers in `README.md`) was rendered only by the retired catalog build (`MindAttic.Deploy/src/parts.js`). GitHub shows those markers as nothing; `config/parts.json` is left in place as the parts/price data.

When invoked, tell the user the above and stop.
