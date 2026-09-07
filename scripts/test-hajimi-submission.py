"""Isolated executable checks for the bundled submission copier."""
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "bundled/capabilities/modeling-submission-package/1.0.0/resources/scripts/build_submission_package.py"


class SubmissionTests(unittest.TestCase):
    def test_package_and_boundaries(self):
        with tempfile.TemporaryDirectory(prefix="hajimi-submission-") as raw:
            root = Path(raw)
            (root / "solver.py").write_text("print(42)\n", encoding="utf-8")
            config = {"output_dir": "deliverables", "staging_name": "v1", "zip_name": "v1.zip",
                      "code_files": [{"source": "solver.py", "target": "代码/solver.py", "appendix": "B1", "purpose": "计算"}]}
            def run():
                path = root / "config.json"
                path.write_text(json.dumps(config), encoding="utf-8")
                return subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True)
            result = run()
            self.assertEqual(result.returncode, 0, result.stderr)
            archive_path = root / "deliverables/v1.zip"
            before = archive_path.read_bytes()
            with zipfile.ZipFile(archive_path) as archive:
                rows = list(csv.DictReader(io.StringIO(archive.read("04_文件校验清单.csv").decode("utf-8-sig"))))
                self.assertEqual({r["相对路径"] for r in rows}, set(archive.namelist()) - {"04_文件校验清单.csv"})
                for row in rows:
                    data = archive.read(row["相对路径"])
                    self.assertEqual(row["SHA256"], hashlib.sha256(data).hexdigest().upper())
                    self.assertEqual(int(row["字节数"]), len(data))
                self.assertNotIn(str(root), archive.read("05_原文件名与提交文件名对照.csv").decode("utf-8-sig"))
            config["replace"] = True
            self.assertNotEqual(run().returncode, 0)
            self.assertEqual(before, archive_path.read_bytes())
            config.pop("replace")
            config.update(staging_name="v2", zip_name="v2.zip")
            config["code_files"] *= 2
            self.assertNotEqual(run().returncode, 0)
            self.assertFalse((root / "deliverables/v2.zip").exists())
            config.update(staging_name="v3", zip_name="v3.zip", output_dir="outside")
            self.assertNotEqual(run().returncode, 0)
            self.assertFalse((root / "outside").exists())
            self.assertEqual((root / "solver.py").read_text(), "print(42)\n")


if __name__ == "__main__":
    unittest.main()
