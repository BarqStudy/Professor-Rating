import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, unquote

spec = importlib.util.spec_from_file_location('migration_setup', Path(__file__).resolve().parents[1] / 'scripts/apply-backend-migrations.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

class ConnectionTests(unittest.TestCase):
    def test_uses_primary_session_connection_and_encodes_credentials(self):
        profiles = [
            {'database_type': 'READ_REPLICA', 'db_host': 'replica.example.test', 'db_user': 'reader', 'pool_mode': 'session'},
            {'db_host': 'aws-0.example.pooler.supabase.com', 'db_port': 6543, 'db_user': 'postgres.project', 'db_name': 'postgres', 'pool_mode': 'transaction'},
            {'db_host': 'aws-0.example.pooler.supabase.com', 'db_port': 5432, 'db_user': 'postgres.project', 'db_name': 'postgres', 'pool_mode': 'session'},
        ]
        password = 'test@pass:/%#'
        url = urlsplit(setup.database_url(profiles, password))
        self.assertEqual(url.port, 5432)
        self.assertEqual(unquote(url.password), password)
        self.assertEqual(url.username, 'postgres.project')
        self.assertEqual(url.path, '/postgres')

    def test_transaction_profile_uses_supavisor_session_port(self):
        url = setup.database_url([{'db_host': 'aws-0.example.pooler.supabase.com', 'db_user': 'postgres.project', 'db_port': 6543, 'pool_mode': 'transaction'}], 'fake')
        self.assertEqual(urlsplit(url).port, 5432)

    def test_refuses_missing_or_malformed_metadata(self):
        for value in [None, [], [{'db_host': 'bad/host', 'db_user': 'postgres'}], [{'db_host': 'safe.test'}], [{'db_host': 'safe.test', 'db_user': 'postgres', 'db_port': True}]]:
            with self.assertRaises(ValueError):
                setup.database_url(value, 'fake')

    def test_logs_hide_raw_and_encoded_secrets_and_database_urls(self):
        with patch.dict(os.environ, {'SUPABASE_DB_PASSWORD':'fake@pass', 'SUPABASE_ACCESS_TOKEN':'fake-token'}):
            value = setup.sanitize('fake@pass fake%40pass fake-token postgresql://user:fake%40pass@db.test/db')
        self.assertNotIn('fake', value)
        self.assertNotIn('postgresql://', value)

if __name__ == '__main__':
    unittest.main()
