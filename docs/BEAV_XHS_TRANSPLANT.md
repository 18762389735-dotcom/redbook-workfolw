# Beav XHS Collector donor-first audit

## Donor identity

- Donor path: `F:\最新工作台\Beav-main\Beav-main`
- Git metadata: unavailable; the supplied donor directory has no `.git` directory.
- Snapshot identity: the SHA-256 values below were calculated from the donor files on 2026-08-31. The donor was read-only during this audit.
- Upstream attribution: Jamailar/Beav, <https://github.com/Jamailar/Beav>, under the included non-commercial license.

| Donor file | SHA-256 |
| --- | --- |
| `Plugin/src/manifest.json` | `3B7FC1EBB02DABA49DC782ED58FD134D8DBCDFE7B561FA0F7A0367E601DEC805` |
| `Plugin/src/xhsBridge.js` | `5013864E64D5662705E294BDC917AC9E9CA44EC0B2EE7E22A2F337513E23EDD5` |
| `Plugin/src/pageObserver.js` | `BE6C34043168EEBBCF861CCC6435F4D07882518919F7C7FC0464990519F0D4D0` |
| `Plugin/src/pageRouteBridge.js` | `600504A2CF18FF6D78F83781656BDBF92ED5AF2341A2BE3E2F9F28B8BCDFE00C` |
| `Plugin/src/captureRuntime.js` | `2D386B73683827A2D8FD0179DB5CEE62BA4789F11752AA37A71AF21B54B8F10B` |
| `Plugin/src/background.js` | `0D5EA8786A0F86F79F3B78B03C4BDD7635FF8A69C3B413BE37FE178418F27DE4` |
| `Plugin/src/THIRD_PARTY_NOTICES.txt` | `A4652EF469788F5F280B702D6DCE387AB0DCEEC689E27D19096635A498A50A02` |

## Feature map from donor source

| Feature | Donor file / function or message | Chrome API dependency | Can copy unchanged? | Electron adapter / target | Audit result |
| --- | --- | --- | --- | --- | --- |
| XHS response interception/cache | `xhsBridge.js`, `window.__REDBOX_XHS_RESPONSES__` | none; MAIN-world patch of `fetch` and XHR | Yes | Existing `desktop/xhs-preload.cjs` already injects the same XHS bridge source | Reusable |
| SPA route observation | `pageRouteBridge.js`; `pageObserver.js` `installPageRouteBridge` | `chrome.runtime.getURL` | Source yes, runtime no | Requires a resource URL shim and isolated content-script lifecycle | Shim needed |
| Page observer | `pageObserver.js`, `detectPageInfo`, `emitPageState` | `chrome.runtime.sendMessage`, `onMessage`, `getURL` | Source yes, runtime no | Typed page-to-main message bridge | Shim needed |
| XHS detail controls | `pageObserver.js`, `injectXhsDetailActions` | `chrome.runtime.sendMessage('save-xhs')` | UI source yes | Needs donor `save-xhs` background executor | Blocked by executor coupling |
| Feed/search card controls | `pageObserver.js`, `injectXhsCardButtons` | `chrome.runtime.sendMessage('save-xhs')` | UI source yes | Needs donor `save-xhs` background executor | Blocked by executor coupling |
| Creator/profile controls | `pageObserver.js`, `injectXhsProfileActions` | `chrome.runtime.sendMessage('xhs:collect-current-blogger')` | UI source yes | Needs donor `collectXhsBloggerFromTab` executor | Blocked by executor coupling |
| Creator identity detection | `background.js`, `extractXhsBloggerPayload` | invoked through `chrome.scripting.executeScript` | No standalone file exists | Must separate a donor function from monolithic background | Not byte-copyable as a vertical slice |
| Creator profile collection | `background.js`, `collectXhsBloggerFromTab` | `tabs`, `scripting`, storage, desktop bridge | No | Redbook Creator API adapter would replace Knowledge/account paths | Coupled to prohibited systems |
| Homepage notes | `background.js`, `extractXhsBloggerNotesPayload`, `collectXhsBloggerNotesFromTab` | `tabs`, `scripting`, `storage`, background queue | No | Future dedicated migration only | Explicitly deferred; baseline blocked |
| Current page collection | `background.js`, `saveXhsNoteFromTab`, `extractXhsNotePayload` | `scripting`, task queue, desktop bridge | No | Signal adapter would need an extracted donor payload boundary | Coupled to Knowledge write path |
| Keyword/search collection | `background.js`, `collectXhsKeyword` | `tabs.create/remove`, `scripting`, queue, random delay | No | Future dedicated migration only | Out of first functional gate |
| Generic capture helpers | `captureRuntime.js` | none | Yes | Could be injected unchanged after a compatible lifecycle exists | Reusable but not sufficient alone |
| Task queue / pause / resume / stop | `background.js`, `enqueueXhsTask`, `runNextXhsTask`, `controlXhsActiveTask` | `chrome.storage.local`, runtime events | No | Current Redbook `CollectorTaskStore` has a different state contract | Cannot copy without changing frozen task semantics |
| Random interval | `background.js`, `normalizeXhsCollectInterval`, `sleepXhsTaskInterruptibly` | queue state | No | Relevant only to deferred baseline/keyword work | Deferred |

## Actual message mapping in donor

| Beav page message | Beav background action | Redbook target status |
| --- | --- | --- |
| `save-xhs` | enqueue `saveXhsNoteFromTab` → `extractXhsNotePayload` → `postKnowledgeEntry` | No safe direct mapping: output is a Beav Knowledge payload, not `XiaohongshuSignal` |
| `xhs:collect-current-blogger` | enqueue `collectXhsBloggerFromTab` → `extractXhsBloggerPayload` → account import + Knowledge write | No safe direct mapping: output enters Beav account/Knowledge system |
| `xhs:collect-blogger-notes` | `collectXhsBloggerNotesFromTab` / API or tab batch | Deferred; baseline remains blocked |
| `xhs:collect-visible-note-links` | `collectVisibleXhsNoteLinksFromTab` | Deferred |
| `xhs:collect-keyword` | `collectXhsKeyword` | Deferred |
| `xhs:control-active-task` | `controlXhsActiveTask` | No direct mapping: different persistent task contract |

## Historical exact incompatibility (before Batch 04.1.2B)

The donor's XHS vertical slice is not currently packaged as independently importable collector modules:

1. `pageObserver.js` provides page-resident controls, but those controls only send messages to the MV3 background service worker.
2. The matching XHS handlers and extractors live inside the monolithic `Plugin/src/background.js` together with unrelated Native Messaging, Desktop Bridge, Knowledge workspace writes, account-import workflow, multi-platform collection, downloads and extension storage.
3. The donor's note and creator success paths terminate in `postKnowledgeEntry` and account-import calls, rather than Redbook's `Signal` / `Creator` APIs.
4. The donor task queue persists through `chrome.storage.local` and publishes extension runtime messages; replacing those APIs with Electron while retaining the file byte-identical is not possible.

Copying `background.js` whole would violate the explicit scope prohibition on Native Host, Knowledge workspace, account import, unrelated platforms and the MV3 service-worker route. Replacing its internals with new Redbook logic would violate the donor-first and byte-preservation requirements.

This was the reason the initial audit stopped before implementation. Batch 04.1.2B then authorized a narrow extraction and a typed Electron adapter; the historical finding remains true for the excluded background/Knowledge/task-queue paths.

## Batch 04.1.2B implementation

The approved vertical slice now keeps donor page files byte-identical under `vendor/beav/plugin-xhs/`, with integrity recorded in `SOURCE_MANIFEST.json`. The full donor background remains a non-runtime reference snapshot. Only these donor functions are executed in Electron:

| Redbook action | Donor function | Redbook boundary |
| --- | --- | --- |
| page detail/card `save-xhs` | `extractXhsNotePayload` | `redbook-payload-adapter.js` → `normalizeXiaohongshuSignal` → `/api/signals/ingest` |
| typed creator action | `extractXhsBloggerPayload` | `redbook-payload-adapter.js` → `normalizeXiaohongshuCreator` → `/api/creators/ingest` |

The extracted function locations in the local derived file are `extractXhsNotePayload` (line 10) and `extractXhsBloggerPayload` (line 844). In the donor snapshot the dispatch roots are `saveXhsNoteFromTab` (line 4666) and `collectXhsBloggerFromTab` (line 5373); their Chrome/Knowledge I/O is intentionally replaced at the adapter boundary.

`desktop/xhs-preload.cjs` injects, in donor order, bridge → route bridge → page observer. `desktop/beav-extension-adapter.cjs` exposes only the two collector messages plus the page-state/safety responses needed by the unchanged observer. Main validates the sender as an owned XHS window before dispatching either action.

The donor observer currently sets `ACCOUNT_BINDING_FEATURE_ENABLED = false`, so its unchanged profile control intentionally does not render the current-blogger action; the typed creator path is available to the Electron adapter and the existing Workbench fallback. Enabling a new overlay/profile detector would violate donor-first scope and is explicitly deferred. Homepage baseline, keyword batch, comments, downloads and the donor queue remain deferred.

The page observer is a page-resident transplant, not a claim that all of Beav's background runtime was copied. `reference/background.js` is excluded from packaged files, while the extracted functions and thin adapters are packaged.

## Safety boundary retained

No Electron setting was changed. The XHS window remains sandboxed with `nodeIntegration: false` and `contextIsolation: true`; no page code receives Node APIs, cookies, credentials, generic IPC or a localhost API capability.

## Required decision before implementation resumes

Choose one of these mutually exclusive authorized paths:

1. **Authorise a narrow donor-function extraction.** Copy the specific XHS extraction functions from donor `background.js` into a clearly attributed derived module, then adapt their payloads to Redbook stores. This is donor-derived, but not byte-identical full-file transplant.
2. **Authorise importing the donor background runtime.** This requires an explicit exception for the currently prohibited Native Host, Knowledge, account import, extension storage and Chrome tabs/scripting dependencies, followed by a security review.

Until one path is selected, the requested page-resident Beav UI cannot perform a real Redbook Signal/Creator ingest without reimplementing a collector protocol or silently coupling the product to prohibited Beav subsystems.

## Native Chrome working copy (today's real-E2E path)

The donor `Plugin/` directory is copied without changing the donor checkout to
`extension/beav-redbook/`. This is the Redbook-owned Chrome working copy for
today's real-data gate; Electron's embedded collector remains experimental and
is not the primary path.

| Feature | Donor entry point | Redbook change |
| --- | --- | --- |
| Current XHS note | `save-xhs` → `saveXhsNoteFromTab` → `extractXhsNotePayload` | copied background sends the donor payload to `redbookConnector.ingestNote` as the primary sink; the original Beav sink is retained only as an offline fallback |
| Creator profile | `xhs:collect-current-blogger` → `collectXhsBloggerFromTab` → `extractXhsBloggerPayload` | copied background sends the donor payload to `redbookConnector.ingestCreator` as the primary sink and falls back to the original Beav sink when the connector is offline |
| Creator homepage notes | `xhs:collect-blogger-notes` → `collectXhsBloggerNotesFromTab` | copied API/tab item boundaries forward each donor note with `creator-baseline` provenance; queue, scroll, retry and random interval remain donor code |
| Connector health | Redbook-owned `src/redbookConnector.js` | `GET http://127.0.0.1:43127/health` with the typed `X-Redbook-Connector: beav-v1` header |

The connector only transports donor-produced payloads. Platform selectors,
identity detection, extraction, queueing and interval behavior are not
reimplemented. Connector failure is logged locally and leaves the original
Beav action available, so an offline Redbook Workbench does not crash the MV3
service worker.
