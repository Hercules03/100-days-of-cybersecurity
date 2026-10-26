# urllib is a library for opening and reading URLs.
import urllib.request
import urllib.parse
import json

# hashlib is a library for hashing strings.
import hashlib
import time
from datetime import datetime, timezone

# 1. Machine-Readable Rules of Engagement (RoE)
ROE_CONFIG = {
    "engagement_id": "ENG-2026-001",
    "operator": "RedTeam-Lead",
    "allowed_hosts": ["127.0.0.1:8000"],
    "attribution_header": "X-RedTeam-Auth",
    "attribution_token": "RoE-Signed-Token-998877"
}

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    # Prevent automatic 301/302 redirects from pivoting out of scope
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, f"Redirect blocked for scope validation: {newurl}", headers, fp)

def log_audit_event(target, status, details):
    """Log an audit event.
    Args:
        target (str): The target URL.
        status (str): The status of the audit event.
        details (str): The details of the audit event.
    Returns:
        None
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    record = f"{timestamp} | {ROE_CONFIG['engagement_id']} | Target: {target} | Status: {status} | Details: {details}"
    record_hash = hashlib.sha256(record.encode()).hexdigest()
    with open("engagement_audit.log", "a") as f:
        f.write(f"{record} | SHA256:{record_hash}\n")
    print(f"[AUDIT] {record}")

def probe_target(url):
    """Probe a target URL and log the audit event.
    Args:
        url (str): The URL to probe.
    Returns:
        None
    """
    parsed = urllib.parse.urlparse(url)
    host_port = f"{parsed.hostname}:{parsed.port or (443 if parsed.scheme == 'https' else 80)}"

    # Technical Scope Boundary Check
    if host_port not in ROE_CONFIG["allowed_hosts"]:
        log_audit_event(url, "BLOCKED_OUT_OF_SCOPE", f"Host {host_port} not in RoE allowlist")
        return

    # Build request with mandatory legal attribution headers
    opener = urllib.request.build_opener(NoRedirectHandler)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": f"Authorized-Pentest/{ROE_CONFIG['engagement_id']}",
            ROE_CONFIG["attribution_header"]: ROE_CONFIG["attribution_token"]
        }
    )

    try:
        with opener.open(req, timeout=3) as response:
            log_audit_event(url, "ALLOWED_EXECUTED", f"HTTP {response.status}")
    except Exception as e:
        log_audit_event(url, "EXECUTION_ERROR", str(e))

if __name__ == "__main__":
    # Test 1: Authorized Target
    probe_target("http://127.0.0.1:8000/admin")
    # Test 2: Unauthorized Target (Out of Scope Port/Service)
    probe_target("http://127.0.0.1:8001/admin")