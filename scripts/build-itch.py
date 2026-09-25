"""Packages the game for an itch.io HTML5 upload.

Collects exactly what index.html loads (plus the font licence and, with
--with-editor, the maze editor) into outputs/sora-man-itch-<date>.zip, then
checks the itch.io limits and prints the release reminders.

    python scripts/build-itch.py [--with-editor]
"""
import datetime
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAX_FILES, MAX_BYTES = 1000, 500 * 1024 * 1024

# Known issues that must be fixed before a public release (none at the moment;
# the GitHub and Hugging Face bonus items are deliberate homages).
BLOCKERS = []



def referenced_files(html):
    """Local files index.html loads, without cache-busting query strings."""
    refs = re.findall(r'(?:src|href)="([^"]+)"', html)
    return sorted({ref.split("?")[0] for ref in refs if not ref.startswith(("data:", "http:", "https:", "#"))})


def main():
    with_editor = "--with-editor" in sys.argv
    index = ROOT / "index.html"
    files = ["index.html", *referenced_files(index.read_text(encoding="utf-8"))]
    font_css = (ROOT / "assets/fonts/crackman.css")
    if font_css.exists():
        files.append("assets/fonts/license.txt")
    if with_editor:
        editor = ROOT / "tools/maze-editor.html"
        files += ["tools/maze-editor.html", *("tools/" + ref if not ref.startswith("..") else ref[3:]
                                             for ref in referenced_files(editor.read_text(encoding="utf-8")))]
    files = sorted(set(files))
    missing = [name for name in files if not (ROOT / name).is_file()]
    if missing:
        print("Missing files referenced by the page:", *missing, sep="\n  ")
        return 1

    out_dir = ROOT / "outputs"
    out_dir.mkdir(exist_ok=True)
    target = out_dir / f"sora-man-itch-{datetime.date.today():%Y%m%d}.zip"
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in files:
            archive.write(ROOT / name, name)

    raw = sum((ROOT / name).stat().st_size for name in files)
    print(f"Wrote {target.relative_to(ROOT)}")
    print(f"  {len(files)} files, {raw / 1024 / 1024:.2f} MB unpacked, {target.stat().st_size / 1024 / 1024:.2f} MB zipped")
    for name in files:
        print(f"    {name}")
    if len(files) > MAX_FILES or raw > MAX_BYTES:
        print("OVER the itch.io limits (1000 files, 500 MB unpacked).")
        return 1
    print("\nitch.io settings: kind of project HTML, 'This file will be played in the browser',")
    print("viewport 448 x 576 (or larger), enable the fullscreen button, SharedArrayBuffer not needed.")
    print("\nRelease reminders:")
    for name, why in BLOCKERS:
        if name in files:
            print(f"  - {name}: {why}")
    print("  - Do not use the name Pac-Man in the page title, tags or description.")
    print("  - Sora tribute: no OpenAI/Sora logos, and keep 'Unofficial fan tribute. Not affiliated with OpenAI.' on the page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
