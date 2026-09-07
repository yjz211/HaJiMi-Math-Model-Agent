"""Small Windows regression check for the runtime builder's batch invocation."""
import os
from pathlib import Path
import runpy
import sys
from tempfile import TemporaryDirectory
import unittest

builder = runpy.run_path(str(Path(__file__).with_name('build-windows-runtime.py')))


@unittest.skipUnless(sys.platform == 'win32', 'Windows cmd.exe contract')
class BatchInvocationTest(unittest.TestCase):
    def test_spaces_and_exit_status(self):
        with TemporaryDirectory(prefix='hajimi batch ') as directory:
            root = Path(directory)
            script = root / 'echo argument.bat'
            script.write_text('@echo off\necho %~1\nexit /b 0\n', encoding='ascii')
            log = root / 'test.log'
            env = {**os.environ, 'SystemRoot': os.environ['SystemRoot']}
            builder['batch'](script, ['hello world'], env, root, log)
            self.assertEqual(log.read_text().strip(), 'hello world')
            script.write_text('@echo off\nif -no-gui == %1 (exit /b 0) else (exit /b 9)\n', encoding='ascii')
            builder['batch'](script, ['-no-gui'], env, root, log)
            with self.assertRaisesRegex(ValueError, 'Unsafe batch argument'):
                builder['batch'](script, ['%PATH%'], env, root, log)
            script.write_text('@exit /b 7\n', encoding='ascii')
            with self.assertRaisesRegex(RuntimeError, r'failed \(7\)'):
                builder['batch'](script, [], env, root, log)


if __name__ == '__main__':
    unittest.main()
