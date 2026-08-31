# Redbook Beav extension working copy

This directory is a Redbook-owned working copy of the Beav browser plugin. The
donor was kept read-only while copying:

- Donor: Jamailar/Beav
- Local donor snapshot: `F:\最新工作台\Beav-main\Beav-main`
- License: MIT License – Non-Commercial Use Only
- Purpose: reuse Beav's native Chrome collector runtime while adding a thin
  Redbook Workflow loopback persistence sink.

The collector, page observer, XHS extraction, creator extraction, homepage
collection, queue, interval, and SPA observation remain donor behavior. The
Redbook additions are limited to `src/redbookConnector.js`, the forwarding
calls in the copied `src/background.js`, and enabling Beav's existing
`ACCOUNT_BINDING_FEATURE_ENABLED` profile control in the working copy. For the
Redbook save actions, the loopback connector is the formal sink: a connector
failure is surfaced to the user and never silently falls back to a separate
Beav Desktop or Knowledge service.

This working copy is the native Chrome/Edge path for real-data validation. The
Electron embedded collector is experimental and is not required for the
browser extension to ingest notes, creators, or homepage-note batches. Beav's
updater UI/checks are disabled in this fork; releases are shipped with the
Redbook Workflow workbench.

The copied upstream files retain their original attribution and are not
covered by Redbook's own license. Commercial use of the derived collector
requires permission from the upstream author.
