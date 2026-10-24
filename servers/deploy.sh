#!/bin/bash
# Deploys all five game servers (Teen Patti, Judgment, Declare, Business Deal, Business Board)
# to one Firebase project. Run it in Google Cloud Shell:
#   bash deploy.sh YOUR-PROJECT-ID
set -uo pipefail
P="${1:-}"
if [ -z "$P" ]; then echo "Usage: bash deploy.sh YOUR-PROJECT-ID"; exit 1; fi
cd "$(dirname "$0")"
say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
FB="npx -y firebase-tools@latest"
command -v firebase >/dev/null 2>&1 && FB=firebase

say "1/7 Project $P"
gcloud config set project "$P" >/dev/null 2>&1
gcloud projects describe "$P" --format='value(projectId)' || { echo "Can't see project $P. Check the ID."; exit 1; }

say "2/7 Turning on the Google services the games need (takes a minute)"
gcloud services enable firestore.googleapis.com cloudfunctions.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com eventarc.googleapis.com pubsub.googleapis.com \
  identitytoolkit.googleapis.com firebaserules.googleapis.com --project "$P" || { echo "Could not turn on services. Is billing (Blaze) on?"; exit 1; }

say "3/7 Database"
if gcloud firestore databases describe --database='(default)' --project "$P" >/dev/null 2>&1; then echo "Database already there."
else gcloud firestore databases create --location=nam5 --project "$P" || { echo "Could not create the database."; exit 1; }; fi

say "4/7 Anonymous sign-in + github.io allowed"
TOKEN=$(gcloud auth print-access-token)
python3 - "$P" "$TOKEN" <<'PY'
import json, sys, urllib.request
p, tok = sys.argv[1], sys.argv[2]
base = f"https://identitytoolkit.googleapis.com/admin/v2/projects/{p}/config"
h = {"Authorization": f"Bearer {tok}", "x-goog-user-project": p, "Content-Type": "application/json"}
def req(url, method="GET", body=None):
    r = urllib.request.Request(url, method=method, headers=h, data=json.dumps(body).encode() if body else None)
    return json.load(urllib.request.urlopen(r))
try:
    try:
        cfg = req(base)
    except Exception:
        req(f"https://identitytoolkit.googleapis.com/v2/projects/{p}/identityPlatform:initializeAuth", "POST", {})
        cfg = req(base)
    doms = cfg.get("authorizedDomains", [])
    for d in ["abhyuday2103.github.io", "localhost"]:
        if d not in doms: doms.append(d)
    req(base + "?updateMask=signIn.anonymous.enabled,authorizedDomains", "PATCH",
        {"signIn": {"anonymous": {"enabled": True}}, "authorizedDomains": doms})
    print("Anonymous sign-in is on.")
except Exception as e:
    print("Could not switch on anonymous sign-in automatically:", e)
    print("Do it by hand: Firebase console > Authentication > Sign-in method > Anonymous > Enable.")
PY

say "5/7 Installing server code"
for d in tp jg dc dl bd bj; do (cd "$d" && npm install --no-audit --no-fund --silent) || { echo "npm install failed in $d"; exit 1; }; done

say "6/7 Deploying the five servers and database rules (5 to 10 minutes)"
$FB deploy --only functions,firestore:rules --project "$P" --non-interactive
DEPLOY=$?
if [ $DEPLOY -ne 0 ]; then
  echo "Deploy hit a problem. If it said you need to log in, run:  $FB login --no-localhost  and then run this script again."
fi

say "7/7 Keeping server copies (this is what broke the old project)"
cat > /tmp/keep-policy.json <<'EOF'
[{"name": "keep-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 5}}]
EOF
gcloud artifacts repositories set-cleanup-policies gcf-artifacts --location=us-central1 --project "$P" \
  --policy=/tmp/keep-policy.json --overwrite --no-dry-run >/dev/null 2>&1 \
  && echo "Cleanup rule replaced: server copies are kept now." \
  || echo "Could not change the cleanup rule. Tell Claude."

say "Checking each server answers"
ALL=ok
for f in tp jg dc dl bd bj; do
  code=$(curl -s -o /tmp/r.txt -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"data":{}}' "https://us-central1-$P.cloudfunctions.net/$f")
  if grep -q '"error"' /tmp/r.txt; then echo "  $f: answering ($code)"; else echo "  $f: NOT answering ($code)"; ALL=bad; fi
done
echo
[ "$ALL" = ok ] && [ $DEPLOY -eq 0 ] && echo "ALL DONE. Tell Claude: deployed $P" || echo "Something above failed. Copy the last 30 lines and send them to Claude."
