"""Append the exact PKCE native callback; preserve all existing Auth settings."""
import json
import os
import urllib.request

CALLBACK = 'website.miyar.app://auth/callback'

def allow_native_callback(value):
    values = [part.strip() for part in (value or '').split(',') if part.strip()]
    if CALLBACK not in values:
        values.append(CALLBACK)
    return ','.join(values)

if __name__ == '__main__':
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
