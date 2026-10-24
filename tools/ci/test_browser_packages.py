import hashlib
import tempfile
import unittest
from pathlib import Path

from restore_browser_packages import restore_packages


class BrowserPackageCacheTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.cache = self.root / "cache"
        self.cache.mkdir()
        self.destination = self.root / "verified"
        self.package = b"an authenticated package archive"
        self.filename = "example_1.0_amd64.deb"
        self.metadata = self.record("example", "1.0", "amd64", self.package)

    @staticmethod
    def record(package, version, architecture, content):
        return (
            f"Package: {package}\nVersion: {version}\nArchitecture: {architecture}\n"
            f"Size: {len(content)}\nSHA256: {hashlib.sha256(content).hexdigest()}\n"
            "Description: an example package\n continuation: not a field\n"
        )

    def restore(self, metadata=None):
        return restore_packages(
            self.cache, self.destination, self.metadata if metadata is None else metadata
        )

    def test_restores_an_archive_matching_repository_metadata(self):
        (self.cache / self.filename).write_bytes(self.package)
        self.assertEqual(self.restore(), 1)
        self.assertEqual((self.destination / self.filename).read_bytes(), self.package)

    def test_rejects_modified_bytes_even_when_filename_and_size_match(self):
        (self.cache / self.filename).write_bytes(b"x" * len(self.package))
        self.assertEqual(self.restore(), 0)
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_rejects_a_valid_archive_renamed_as_another_package(self):
        (self.cache / "other_1.0_amd64.deb").write_bytes(self.package)
        self.assertEqual(self.restore(), 0)

    def test_rejects_outdated_versions_and_wrong_architectures(self):
        for filename in ("example_0.9_amd64.deb", "example_1.0_arm64.deb"):
            (self.cache / filename).write_bytes(self.package)
        self.assertEqual(self.restore(), 0)

    def test_rejects_symlinks_and_directories(self):
        archive = self.root / "real.deb"
        archive.write_bytes(self.package)
        (self.cache / self.filename).symlink_to(archive)
        (self.cache / "other_1.0_amd64.deb").mkdir()
        self.assertEqual(self.restore(), 0)

    def test_missing_cache_is_a_normal_cold_install(self):
        self.cache.rmdir()
        self.assertEqual(self.restore(), 0)

    def test_repository_metadata_is_required_instead_of_a_cached_manifest(self):
        (self.cache / self.filename).write_bytes(self.package)
        (self.cache / "SHA256SUMS").write_text(hashlib.sha256(self.package).hexdigest())
        self.assertEqual(self.restore("Package: example\nVersion: 1.0\nArchitecture: amd64\n"), 0)

    def test_accepts_epochs_and_multiple_authenticated_versions(self):
        filename = "example_2%3a1.0_amd64.deb"
        (self.cache / filename).write_bytes(self.package)
        metadata = self.metadata + "\n" + self.record("example", "2:1.0", "amd64", self.package)
        self.assertEqual(self.restore(metadata), 1)


if __name__ == "__main__":
    unittest.main()
