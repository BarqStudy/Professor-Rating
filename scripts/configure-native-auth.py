"""Append the exact PKCE native callback; preserve all existing Auth settings."""
import json
import os
import urllib.request
import urllib.error

CALLBACK = 'website.miyar.app://auth/callback'

def allow_native_callback(value):
    values = [part.strip() for part in (value if isinstance(value,list) else (value or '').split(',')) if part.strip()]
    if CALLBACK not in values:
        values.append(CALLBACK)
    return ','.join(values)

def configure():
    url = f"https://api.supabase.com/v1/projects/{os.environ['SUPABASE_PROJECT_REF']}/config/auth"
    headers = {'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN'], 'Content-Type': 'application/json'}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
        current = json.load(response)
    value = allow_native_callback(current.get('uri_allow_list'))
    if value != current.get('uri_allow_list'):
        request = urllib.request.Request(url, headers=headers, method='PATCH', data=json.dumps({'uri_allow_list': value}).encode())
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
    print('Native PKCE redirect allowed. Existing providers and redirect URLs preserved.')

if __name__ == '__main__':
    try:
        configure()
    except urllib.error.HTTPError as error:
        try:
            details=json.loads(error.read())
            message=str(details.get('message') or details.get('error') or '')[:300].replace('\n',' ').replace('\r',' ')
        except Exception:
            message=''
        if error.code==403 and 'auth_config_' in message:
            print('::warning title=Native OAuth redirect::The deployment token cannot configure Auth redirects. Add website.miyar.app://auth/callback in Supabase Auth URL Configuration before testing native sign-in.')
            if os.environ.get('GITHUB_STEP_SUMMARY'):
                with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as summary:
                    summary.write('\nNative sign-in requires a manual Redirect URL: `website.miyar.app://auth/callback`. Existing deployment credentials lack Auth configuration permissions. Backend deployment completed; native OAuth configuration is not verified.\n')
            raise SystemExit(0)
        print(f'::error title=Native OAuth redirect::Auth configuration request failed: HTTP {error.code}. {message}')
        raise SystemExit(1)
