# Redbook Workflow extension copy

This directory contains the complete Redbook-owned copy of the upstream Beav
`Plugin` directory. For Chrome **Load unpacked**, choose the nested manifest
root:

`extension/beav-redbook/src`

The Workbench desktop app must be running first. It starts the Redbook
loopback connector at `http://127.0.0.1:43127`. The extension forwards only
donor-produced XHS note and creator payloads to that connector; it does not
read credentials or cookies.
