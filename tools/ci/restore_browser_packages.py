import hashlib
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote


def restore_packages(cache, destination, metadata):
    expected = {}
    for paragraph in metadata.split("\n\n"):
        fields = dict(
            line.split(": ", 1)
            for line in paragraph.splitlines()
            if not line.startswith((" ", "\t")) and ": " in line
        )
        if not all(
            field in fields
            for field in ("Package", "Version", "Architecture", "SHA256", "Size")
        ):
            continue
        identity = (fields["Package"], fields["Version"], fields["Architecture"])
        expected.setdefault(identity, set()).add(
            (int(fields["Size"]), fields["SHA256"].lower())
        )

    destination.mkdir(parents=True)
    restored = 0
    if cache.is_symlink():
        return restored
    for archive in sorted(cache.glob("*.deb")):
        identity = tuple(unquote(part) for part in archive.stem.split("_"))
        hashes = expected.get(identity)
        if not hashes or not stat.S_ISREG(archive.lstat().st_mode):
            continue
        with archive.open("rb") as source:
            digest = hashlib.sha256()
            size = 0
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
                size += len(chunk)
            if (size, digest.hexdigest()) not in hashes:
                print(f"Ignoring unverified archive: {archive.name}")
                continue
            source.seek(0)
            with (destination / archive.name).open("xb") as target:
                shutil.copyfileobj(source, target)
            restored += 1
    return restored


if __name__ == "__main__":
    metadata = subprocess.run(
        ["apt-cache", "dumpavail"], check=True, capture_output=True, text=True
    ).stdout
    count = restore_packages(Path(sys.argv[1]), Path(sys.argv[2]), metadata)
    print(f"Restored {count} verified Ubuntu package archives.")
