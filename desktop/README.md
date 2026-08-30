# Desktop shell reservation

This directory is reserved for the future Electron main process and Windows packaging configuration. Batch 02 intentionally contains no Electron runtime or packaging dependency.

The renderer remains in `apps/web`; business logic remains in `core`; runtime stores receive paths from the shell. See `docs/DESKTOP_DISTRIBUTION.md` before adding files here.
