"""Read-only WhatsApp health check: asks Meta whether this number can send.

Use it when the bot looks silent but the backend logs `whatsapp.send.ok`:
Meta's API accepts a message and can still refuse to deliver it (billing,
policy), and the bot does not log delivery-status webhooks.

Needs ADMIN_TOKEN in the environment (an admin JWT for the backend). The
WhatsApp access token is read from the published integration config at run
time and is never printed or written anywhere.

    ADMIN_TOKEN=... python docs/ops/whatsapp-health.py
"""
import collections, datetime, json, os, urllib.error, urllib.parse, urllib.request

BASE = os.environ.get("API_BASE", "https://shetrades-backend-staging-214511840103.us-central1.run.app")


def get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}


st, doc = get(BASE + "/api/config/admin/integration/documents/integration.whatsapp.primary",
              {"authorization": "Bearer " + os.environ["ADMIN_TOKEN"]})
cfg = ((doc.get("published") or {}).get("payload") or {})
H = {"Authorization": "Bearer " + cfg["accessToken"]}
G = "https://graph.facebook.com/" + cfg["apiVersion"]

fields = "display_phone_number,verified_name,quality_rating,status,name_status,messaging_limit_tier,health_status"
st, r = get(f"{G}/{cfg['phoneNumberId']}?fields={fields}", H)
print("phone:", r.get("display_phone_number"), "|", r.get("verified_name"), "| quality", r.get("quality_rating"),
      "| status", r.get("status"), "| tier", r.get("messaging_limit_tier"))
hs = r.get("health_status") or {}
print("CAN SEND:", hs.get("can_send_message"))
for e in hs.get("entities", []):
    print("  ", e.get("entity_type"), e.get("can_send_message"))
    for err in e.get("errors") or []:
        print("      ", err.get("error_code"), "|", err.get("error_description"), "|", err.get("possible_solution"))

now = datetime.datetime.now(datetime.timezone.utc)
start, end = int((now - datetime.timedelta(hours=24)).timestamp()), int(now.timestamp())
f = f"analytics.start({start}).end({end}).granularity(HALF_HOUR)"
st, r = get(f"{G}/{cfg['businessAccountId']}?fields=" + urllib.parse.quote(f, safe="().,"), H)
hourly = collections.OrderedDict()
for x in sorted((r.get("analytics") or {}).get("data_points") or [], key=lambda x: x.get("start", 0)):
    k = datetime.datetime.fromtimestamp(x["start"], datetime.timezone.utc).strftime("%m-%d %H")
    s, d = hourly.get(k, (0, 0))
    hourly[k] = (s + (x.get("sent") or 0), d + (x.get("delivered") or 0))
print("Meta's own count, last 24 h (hour UTC, sent, delivered):")
for k, (s, d) in hourly.items():
    print("  ", k, str(s).rjust(6), str(d).rjust(6))
