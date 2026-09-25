---
name: backup
description: Snapshot Astra-Man's source files into backups/ before a change. Use before any non-trivial edit, and whenever another project skill says to back up.
---

# Back up before a change

The project isn't a git repository, so snapshots in `backups/` are the safety net. The convention is `backups/before-<what>-<YYYYMMDD>/`.

1. Choose a short label for the change, for example `before-powerup-laser`, and today's date as `YYYYMMDD`.
2. Copy the source files, keeping `tests/` as a subfolder:
   ```bash
   d=backups/<label>-<YYYYMMDD> && mkdir -p "$d/tests" && cp *.js *.html *.css README.md "$d/" && cp tests/*.js "$d/tests/" && ls "$d"
   ```
   Also copy any other folder you're about to edit, such as `tools/`, `scripts/` or `assets/fonts/`.

   Don't copy `backups/` itself, `outputs/` or `assets/audio/`, which is large and unchanged by code work.
3. If the folder already exists, add a suffix (`-2`) rather than overwriting it.
4. Tell the user where the backup is.

To restore, copy the files back from the folder, after checking with the user.
