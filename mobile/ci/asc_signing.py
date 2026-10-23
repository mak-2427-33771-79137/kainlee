#!/usr/bin/env python3
"""App Store signing for the TestFlight workflow, through the App Store Connect API.

  setup   – creates a temporary Apple Distribution certificate (private key made here)
            and an App Store provisioning profile for the app; writes them to $RUNNER_TEMP
  cleanup – deletes the profile and revokes the temporary certificate.
            Builds already uploaded to TestFlight / the App Store are not affected.

Environment: APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID, RUNNER_TEMP, GITHUB_ENV
"""
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request
import jwt

API = "https://api.appstoreconnect.apple.com/v1"
TMP = os.environ.get("RUNNER_TEMP", "/tmp")
BUNDLE_ID = os.environ.get("BUNDLE_ID", "com.makjal.kainlee")
STATE = os.path.join(TMP, "asc_signing.json")


def note(level, title, msg):
    print(f"::{level} title={title}::{msg}", flush=True)


def token():
    key = open(os.environ["ASC_KEY_PATH"]).read()
    now = int(time.time())
    return jwt.encode({"iss": os.environ["APPSTORE_ISSUER_ID"].strip(), "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                      key, algorithm="ES256", headers={"kid": os.environ["APPSTORE_KEY_ID"].strip(), "typ": "JWT"})


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:600]
        raise RuntimeError(f"{method} {path} -> {e.code}: {detail}")


def setenv(**kv):
    with open(os.environ["GITHUB_ENV"], "a") as f:
        for k, v in kv.items():
            f.write(f"{k}={v}\n")


def setup():
    key_pem = os.path.join(TMP, "dist_key.pem")
    csr = os.path.join(TMP, "dist.csr")
    subprocess.run(["openssl", "genrsa", "-out", key_pem, "2048"], check=True, capture_output=True)
    subprocess.run(["openssl", "req", "-new", "-key", key_pem, "-out", csr, "-subj", "/CN=Kainlee CI/O=Kainlee/C=IN"], check=True, capture_output=True)
    csr_b64 = "".join(l for l in open(csr).read().splitlines() if "CERTIFICATE REQUEST" not in l)

    # bundle ID
    r = call("GET", f"/bundleIds?filter[identifier]={BUNDLE_ID}&limit=20")
    match = [b for b in r.get("data", []) if b["attributes"]["identifier"] == BUNDLE_ID]
    if not match:
        note("error", "Bundle ID", f"{BUNDLE_ID} is not registered in Certificates, Identifiers & Profiles.")
        sys.exit(1)
    bundle_res = match[0]["id"]

    # temporary distribution certificate
    try:
        cert = call("POST", "/certificates", {"data": {"type": "certificates", "attributes": {"certificateType": "DISTRIBUTION", "csrContent": csr_b64}}})["data"]
    except RuntimeError as e:
        msg = str(e)
        if "409" in msg or "maximum" in msg.lower() or "limit" in msg.lower():
            note("error", "Certificate limit", "Your team already has the maximum number of distribution certificates. "
                 "In Certificates, Identifiers & Profiles › Certificates, revoke an old unused 'Apple Distribution' certificate, then run again.")
        else:
            note("error", "Certificate", msg)
        sys.exit(1)
    cert_id = cert["id"]
    json.dump({"cert": cert_id}, open(STATE, "w"))
    der = os.path.join(TMP, "dist.cer")
    open(der, "wb").write(base64.b64decode(cert["attributes"]["certificateContent"]))

    # App Store provisioning profile
    name = f"Kainlee CI {time.strftime('%Y%m%d%H%M%S')}"
    prof = call("POST", "/profiles", {"data": {"type": "profiles", "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
                                               "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_res}},
                                                                 "certificates": {"data": [{"type": "certificates", "id": cert_id}]}}}})["data"]
    json.dump({"cert": cert_id, "profile": prof["id"]}, open(STATE, "w"))
    content = base64.b64decode(prof["attributes"]["profileContent"])
    uuid = prof["attributes"]["uuid"]
    for d in ("~/Library/MobileDevice/Provisioning Profiles", "~/Library/Developer/Xcode/UserData/Provisioning Profiles"):
        p = os.path.expanduser(d)
        os.makedirs(p, exist_ok=True)
        open(os.path.join(p, f"{uuid}.mobileprovision"), "wb").write(content)

    # .p12 for the keychain
    pem = os.path.join(TMP, "dist_cert.pem")
    subprocess.run(["openssl", "x509", "-inform", "DER", "-in", der, "-out", pem], check=True, capture_output=True)
    p12 = os.path.join(TMP, "dist.p12")
    pw = base64.b16encode(os.urandom(12)).decode()
    args = ["openssl", "pkcs12", "-export", "-inkey", key_pem, "-in", pem, "-out", p12, "-passout", f"pass:{pw}", "-name", "Kainlee CI"]
    r = subprocess.run(args + ["-legacy"], capture_output=True)
    if r.returncode != 0:
        subprocess.run(args, check=True, capture_output=True)
    print(f"::add-mask::{pw}")
    setenv(SIGN_P12=p12, SIGN_P12_PASS=pw, PROFILE_NAME=name, PROFILE_UUID=uuid)
    note("notice", "Signing ready", f"Temporary distribution certificate and App Store profile '{name}' created.")


def cleanup():
    if not os.path.exists(STATE):
        return
    s = json.load(open(STATE))
    for kind, key in (("profiles", "profile"), ("certificates", "cert")):
        if s.get(key):
            try:
                call("DELETE", f"/{kind}/{s[key]}")
                print(f"Deleted {kind[:-1]} {s[key]}")
            except Exception as e:
                note("warning", "Cleanup", f"Could not delete {kind[:-1]} {s[key]}: {e}")


if __name__ == "__main__":
    {"setup": setup, "cleanup": cleanup}[sys.argv[1]]()
