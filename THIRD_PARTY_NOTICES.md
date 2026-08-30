# Third-party notices

## Beav-derived collector portions

Upstream: [https://github.com/Jamailar/Beav](https://github.com/Jamailar/Beav)

Copied upstream file:

- `Plugin/src/xhsBridge.js` → `vendor/beav/xhs-collector/xhsBridge.js`

Highly derived extractor logic:

- `vendor/beav/xhs-collector/beavExtractors.js`

The project also contains local adapter/new files (`background.js`, `popup.*`, `manifest.json`, and `collector-payload.js`) which are not represented as original Beav files. See [`docs/BEAV_ATTRIBUTION.md`](docs/BEAV_ATTRIBUTION.md) for the detailed boundary.

License: **MIT License – Non-Commercial Use Only**. The unmodified upstream license text is distributed at `vendor/beav/LICENSE` and must accompany packaged applications. Commercial use requires prior written permission from the upstream author, or a future rewrite of all restricted derived Collector code.
