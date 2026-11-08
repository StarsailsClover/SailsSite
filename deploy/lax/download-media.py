#!/usr/bin/env python3
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: download-media.py <playlist.json> <destination>", file=sys.stderr)
        return 2

    playlist_path = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    source_base = os.environ.get(
        "MEDIA_SOURCE",
        "https://sails.n0th1n3ssd0ma1n.top/",
    )
    destination.mkdir(parents=True, exist_ok=True)
    playlist = json.loads(playlist_path.read_text(encoding="utf-8"))

    for song in playlist.get("songs", []):
        relative = str(song.get("filePath") or "")
        if not relative.lower().endswith(".mp3"):
            continue
        target = destination / Path(relative).name
        if target.exists() and target.stat().st_size > 1024:
            print(f"keep {target.name}")
            continue
        url = urllib.parse.urljoin(source_base, urllib.parse.quote(relative, safe="/"))
        request = urllib.request.Request(url, headers={"User-Agent": "SailsSiteMediaMigration/1"})
        partial = target.with_suffix(target.suffix + ".part")
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"{url}: HTTP {response.status}")
            length = 0
            with partial.open("wb") as output:
                while chunk := response.read(1024 * 256):
                    length += len(chunk)
                    if length > 30 * 1024 * 1024:
                        raise RuntimeError(f"{url}: file exceeds 30 MiB")
                    output.write(chunk)
        partial.replace(target)
        print(f"downloaded {target.name} ({length} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
