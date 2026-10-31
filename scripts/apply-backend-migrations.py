"""Apply additive migrations with bounded retries and sanitized CI diagnostics."""
import os
import re
import subprocess
import time
from pathlib import Path
import json
import urllib.request
import urllib.error
from urllib.parse import quote


def sanitize(output):
    for name in ('SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'):
        value = os.environ.get(name)
        if value:
            output = output.replace(value, '[redacted]').replace(quote(value,safe=''), '[redacted]')
    output = re.sub(r'postgres(?:ql)?://[^\s]+', '[database URL redacted]', output)
    return output


def run(command):
    for attempt in range(3):
        result = subprocess.run(command, capture_output=True, text=True)
        output = sanitize(result.stdout + result.stderr)
        print(output, flush=True)
        if result.returncode == 0:
            return
        transient = re.search(r'timeout|timed out|connection refused|connection reset|temporary|unexpected eof|failed to connect|too many connections|502|503|504', output, re.I)
        if transient and attempt < 2:
            time.sleep(3 * (attempt + 1))
            continue
        summary = '\n'.join(output.strip().splitlines()[-18:])[:5000]
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as target:
                target.write('\nBackend migration setup stopped:\n\n```text\n' + summary.replace('```', '') + '\n```\n')
        annotation = summary.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error title=Backend migration setup::' + annotation, flush=True)
        raise SystemExit(result.returncode)


def database_url(profiles, password):
    """Use the project's existing DB credential, without retrieving API keys."""
    if not password or not isinstance(profiles, list):
        raise ValueError('Database connection configuration is unavailable.')
    primary = [p for p in profiles if isinstance(p, dict) and str(p.get('database_type', 'PRIMARY')).upper() == 'PRIMARY']
    sessions = [p for p in primary if str(p.get('pool_mode', '')).lower() == 'session']
    candidates = sessions or primary
    if not candidates:
        raise ValueError('No primary database connection was returned.')
    profile = candidates[0]
    host, user = profile.get('db_host'), profile.get('db_user')
    if not isinstance(host, str) or not re.fullmatch(r'[A-Za-z0-9.-]+', host) or not user:
        raise ValueError('The database connection metadata is incomplete.')
    port = profile.get('db_port', 5432)
    # Supavisor exposes session pooling on 5432; migrations need that connection.
    if not sessions and host.endswith('.pooler.supabase.com'):
        port = 5432
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('The database connection port is invalid.')
    return f"postgresql://{quote(str(user), safe='')}:{quote(password, safe='')}@{host}:{port}/{quote(str(profile.get('db_name') or 'postgres'), safe='')}"


def apply_migrations():
    project = os.environ['SUPABASE_PROJECT_REF']
    request = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{project}/config/database/pooler',
        headers={'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        profiles = json.load(response)
    url = database_url(profiles, os.environ['SUPABASE_DB_PASSWORD'])
    run(['supabase', 'db', 'push', '--db-url', url, '--yes'])


if __name__ == '__main__':
    try:
        apply_migrations()
    except Exception as error:
        # Never emit connection responses, tracebacks or credentials to public logs.
        message = 'Database connection setup failed.'
        if isinstance(error, urllib.error.HTTPError):
            message += f' Supabase returned HTTP {error.code} for Connection Pooling configuration.'
            try:
                details = json.loads(error.read())
                missing = details.get('error', {}).get('missing_permissions', [])
                if isinstance(missing, list):
                    scopes = [s for s in missing if isinstance(s, str) and re.fullmatch(r'[a-z_]+', s)]
                    if scopes:
                        message += ' Missing permissions: ' + ', '.join(scopes)
            except Exception:
                pass
        elif isinstance(error, ValueError):
            message += ' ' + str(error)
        elif isinstance(error, urllib.error.URLError):
            message += ' Supabase connection metadata could not be reached.'
        print('::error title=Backend database connection::' + sanitize(message), flush=True)
        raise SystemExit(1)
