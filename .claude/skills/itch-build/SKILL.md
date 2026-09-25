---
name: itch-build
description: Package Astra-Man as an itch.io HTML5 zip and report release blockers. Use when asked to build, package, export, release or upload the game to itch.io.
---

# Build for itch.io

1. Run all five test suites first and stop if any fail:
   ```bash
   node tests/engine.test.js && node tests/audio.test.js && node tests/art.test.js && node tests/effects.test.js && node tests/modes.test.js
   ```
2. Package the game:
   ```bash
   python scripts/build-itch.py
   ```
   Add `--with-editor` to ship the maze editor at `tools/maze-editor.html` as well.

   The script:
   - zips exactly what `index.html` loads, into `outputs/astra-man-itch-<date>.zip`;
   - checks the itch.io limits;
   - lists known release blockers.
3. Report the zip path, its size and **every blocker** it prints. At the time of writing:
   - `sound-bank.js` holds the Namco audio, which has no redistribution rights;
   - the bonus items include GitHub and Hugging Face look-alike logos;
   - the name "Pac-Man" must not appear in the itch page title, tags or description.

   Don't describe the build as ready to publish while blockers remain.
4. Optionally smoke-test the zip. Unzip it to a scratch folder, serve that folder with the `astra-man` launch configuration pointed at it (or any static server), open it in the browser pane, start a game and check the console for errors.
5. itch.io page settings to pass on:
   - Kind of project: HTML.
   - Upload the zip and tick "This file will be played in the browser".
   - Viewport 448 × 576 or larger.
   - Enable the fullscreen button.
   - Mobile friendly: yes (there are touch controls).

Uploading to itch.io is the user's action. Don't upload or publish on their behalf.
