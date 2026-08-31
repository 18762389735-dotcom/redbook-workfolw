# Third-party notices

## Beav-derived collector portions

Upstream: [https://github.com/Jamailar/Beav](https://github.com/Jamailar/Beav)

Copied upstream file:

- `Plugin/src/xhsBridge.js` → `vendor/beav/xhs-collector/xhsBridge.js`

Highly derived extractor logic:

- `vendor/beav/xhs-collector/beavExtractors.js`

Beav XHS vertical-slice transplant:

- byte-identical donor files under `vendor/beav/plugin-xhs/` are recorded in `SOURCE_MANIFEST.json`;
- `vendor/beav/plugin-xhs/background-xhs-derived.js` preserves the donor's `extractXhsNotePayload` and `extractXhsBloggerPayload` function bodies while excluding the donor's Chrome/Knowledge output boundary;
- `vendor/beav/plugin-xhs/redbook-payload-adapter.js` is a local, thin schema/output adapter only.

The complete upstream `Plugin/src/background.js` snapshot is retained under `vendor/beav/plugin-xhs/reference/` for attribution and diffing only. It is not loaded at runtime or distributed in the packaged application.

The project also contains local adapter/new files (`background.js`, `popup.*`, `manifest.json`, and `collector-payload.js`) which are not represented as original Beav files. See [`docs/BEAV_ATTRIBUTION.md`](docs/BEAV_ATTRIBUTION.md) for the detailed boundary.

The Redbook-owned Chrome working copy at `extension/beav-redbook/` is copied
from the same donor snapshot. Its `REDBOOK_FORK.md` and connector changes mark
the additional Redbook transport code; those additions are not upstream Beav
source. The donor's `Plugin/src/THIRD_PARTY_NOTICES.txt` is retained in the
working copy.

License: **MIT License – Non-Commercial Use Only**. The unmodified upstream license text is distributed at `vendor/beav/LICENSE` and must accompany packaged applications. Commercial use requires prior written permission from the upstream author, or a future rewrite of all restricted derived Collector code.
