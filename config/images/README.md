# Local part-image overrides

Drop a file named after a part `id` (from `config/parts.json`) into this directory and `build-html.js` will use it as the gallery card image, base64-embedded into the generated `.htm`.

Wins over the remote URL list inside `scripts/build-html.js` — useful when:

- The vendor's CDN blocks hotlinking (403)
- The image URL has rotted (404)
- You want a specific photo (e.g., the actual unit you bought)

## Supported extensions

`.jpg` · `.png` · `.webp` · `.svg`

## Filename pattern

`<part-id>.<ext>` — for example:

```
pi-zero-2-wh.jpg
whisplay-hat.png
respeaker-xvf3800.webp
tplink-kasa-hs103.svg
```

The build script reads the bytes, picks the matching MIME type from the extension, base64-encodes, and emits a `.part-card[data-pid="<id>"] .part-image { background-image: url(data:...) }` rule inline in the HTML.

## Refreshing

After dropping in a new image:

```powershell
.\scripts\build-html.bat
```

Or, from the Console:

```
Claudia.Console build-html
```

Local overrides take effect immediately — they bypass `config/images-cache/`.
