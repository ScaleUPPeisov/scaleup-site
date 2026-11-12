import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest

file = Path(__file__).resolve().parent / "agent.py"
spec = importlib.util.spec_from_file_location("studio_mac_agent", file)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class AgentSecurityTests(unittest.TestCase):
    def test_uuid_rejects_traversal_and_invalid_ids(self):
        self.assertEqual(agent.uid("123e4567-e89b-42d3-a456-426614174000"),
                         "123e4567-e89b-42d3-a456-426614174000")
        for raw in ["../../private", "", "123e4567-e89b-42d3-a456-426614174000/evil",
                    "123e4567-E89B-42D3-A456-426614174000"]:
            with self.assertRaises(agent.AgentError):
                agent.uid(raw)

    def test_image_download_host_validation(self):
        agent.safe_remote("https://v3.fal.media/files/safe.jpg", "image")
        agent.safe_remote("https://s3.lumean.app/file.mp3", "audio")
        for raw in [
            "http://v3.fal.media/files/x.jpg",
            "https://v3.fal.media.evil.example/file",
            "https://127.0.0.1/file",
            "https://169.254.169.254/metadata",
            "file:///etc/passwd",
            "https://user:password@v3.fal.media/img",
            "https://v3.fal.media:444/files/img.jpg",
        ]:
            with self.assertRaises(agent.AgentError, msg=raw):
                agent.safe_remote(raw, "image")

    def test_local_private_auth_file(self):
        with tempfile.TemporaryDirectory() as root:
            original = (agent.APP, agent.ROOT, agent.INBOX,
                        agent.RESULTS, agent.PROJECTS)
            try:
                agent.APP = Path(root) / "auth"
                agent.ROOT = Path(root) / "studio"
                agent.INBOX = agent.ROOT / "Bridge/Inbox"
                agent.RESULTS = agent.ROOT / "Bridge/Results"
                agent.PROJECTS = agent.ROOT / "Projects"
                credentials = agent.APP / "auth.json"
                agent.save_private(credentials, {"refresh_token": "test-value"})
                self.assertEqual(agent.read_json(credentials)["refresh_token"], "test-value")
                self.assertEqual(stat.S_IMODE(os.stat(credentials).st_mode), 0o600)
            finally:
                (agent.APP, agent.ROOT, agent.INBOX, agent.RESULTS, agent.PROJECTS) = original

    def test_no_cloud_shell_command_execution(self):
        source = file.read_text("utf-8")
        self.assertNotIn("shell=True", source)
        self.assertNotIn("os.system(", source)
        self.assertNotIn("subprocess.run(", source)
        self.assertNotIn("eval(", source)


if __name__ == "__main__":
    unittest.main()
