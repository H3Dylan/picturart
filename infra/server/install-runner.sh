#!/usr/bin/env bash
# Installe le runner GitHub Actions auto-hébergé dans le CT 107 (à lancer en root sur l'hôte Proxmox).
# Usage : install-runner.sh <jeton d'enregistrement>
# Le jeton se génère sur GitHub : dépôt > Settings > Actions > Runners > New self-hosted runner (valable 1 h).
set -euo pipefail

CTID=107
REPO_URL=https://github.com/H3Dylan/picturart
TOKEN=${1:?Usage : install-runner.sh <jeton>}

VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].lstrip("v"))')
echo ">> Runner GitHub v$VERSION"

pct exec "$CTID" -- su - runner -c "
  set -euo pipefail
  mkdir -p ~/actions-runner && cd ~/actions-runner
  if [ ! -f config.sh ]; then
    curl -fsSL -o runner.tar.gz https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-x64-$VERSION.tar.gz
    tar xzf runner.tar.gz && rm runner.tar.gz
  fi
"

# Dépendances système du runner (libicu…), en root
pct exec "$CTID" -- bash -c "cd /home/runner/actions-runner && ./bin/installdependencies.sh"

pct exec "$CTID" -- su - runner -c "
  cd ~/actions-runner
  ./config.sh --unattended --url $REPO_URL --token $TOKEN --name ct107-picturart --labels picturart --replace
"

# Service systemd (lancé en tant que runner)
pct exec "$CTID" -- bash -c "cd /home/runner/actions-runner && ./svc.sh install runner && ./svc.sh start"
echo ">> Runner installé et démarré."
