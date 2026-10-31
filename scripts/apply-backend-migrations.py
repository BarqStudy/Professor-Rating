"""Apply additive migrations with bounded retries and sanitized CI diagnostics."""
import os
import re
import subprocess
import time
from pathlib import Path


def sanitize(output):
    for name in ('SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'):
        value = os.environ.get(name)
        if value:
            output = output.replace(value, '[redacted]')
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


if __name__ == '__main__':
    run(['supabase', 'link', '--project-ref', os.environ['SUPABASE_PROJECT_REF'], '--yes'])
    run(['supabase', 'db', 'push', '--linked', '--yes'])
