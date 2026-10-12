#!/usr/bin/env bash
# Prépare le CT 107 « picturart » sur l'hôte Proxmox (à lancer en root sur l'hôte).
# Idempotent pour le dataset ; refuse de toucher un CT 107 existant.
set -euo pipefail

CTID=107
IP=192.168.1.107/24
GATEWAY=192.168.1.1
BRIDGE=vmbr0
DATASET=rpool/picturart
QUOTA=500G

if pct status "$CTID" &>/dev/null; then
  echo "Le CT $CTID existe déjà, abandon." >&2
  exit 1
fi

echo ">> Dataset $DATASET (quota $QUOTA)"
zfs list "$DATASET" &>/dev/null || zfs create -o compression=lz4 -o recordsize=1M -o atime=off "$DATASET"
zfs set quota="$QUOTA" "$DATASET"
DATASET_PATH=$(zfs get -H -o value mountpoint "$DATASET")
chown 100000:100000 "$DATASET_PATH"

echo ">> Template Debian 13"
pveam update >/dev/null
TEMPLATE=$(pveam available --section system | awk '/debian-13-standard_.*_amd64/ {print $2}' | sort -V | tail -n1)
pveam list local | grep -q "$TEMPLATE" || pveam download local "$TEMPLATE"

echo ">> Création du CT $CTID"
pct create "$CTID" "local:vztmpl/$TEMPLATE" \
  --hostname picturart \
  --cores 4 --memory 4096 --swap 1024 \
  --rootfs local-zfs:32 \
  --net0 "name=eth0,bridge=$BRIDGE,ip=$IP,gw=$GATEWAY" \
  --unprivileged 1 --features nesting=1,keyctl=1 \
  --onboot 1 --tags "docker;picturart"
pct set "$CTID" -mp0 "$DATASET_PATH,mp=/srv/picturart/media"
pct start "$CTID"
sleep 5

# iGPU (QuickSync) pour le worker : la carte appartient au groupe « render » du CT,
# que le conteneur worker rejoint (group_add dans docker-compose.prod.yml)
if [ -e /dev/dri/renderD128 ]; then
  RENDER_GID=$(pct exec "$CTID" -- getent group render | cut -d: -f3)
  pct set "$CTID" -dev0 "/dev/dri/renderD128,gid=${RENDER_GID}"
  pct reboot "$CTID"
  sleep 10
fi

echo ">> Installation dans le CT (Docker, utilisateur runner, secrets)"
pct exec "$CTID" -- bash -s <<'IN_CT'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
for _ in $(seq 1 30); do getent hosts deb.debian.org >/dev/null && break; sleep 2; done

apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install ca-certificates curl git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Utilisateur du runner GitHub : déploie via Docker, rien d'autre
id runner &>/dev/null || useradd --create-home --shell /bin/bash --groups docker runner

mkdir -p /srv/picturart/postgres
chown runner:runner /srv/picturart
chown 1000:1000 /srv/picturart/media   # utilisateur « node » du conteneur api

if [ ! -f /srv/picturart/.env ]; then
  PW=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40 || true)
  cat > /srv/picturart/.env <<ENV
POSTGRES_PASSWORD=${PW}
DATABASE_URL=postgres://picturart:${PW}@postgres:5432/picturart
ENV
  chown runner:runner /srv/picturart/.env
  chmod 600 /srv/picturart/.env
fi
IN_CT

echo ">> Snapshots automatiques du dataset"
cat > /etc/sanoid/sanoid.conf <<'SANOID'
# Snapshots des médias Pictur'Art. Protège des suppressions accidentelles,
# PAS d'une panne du SSD (copie hors site à mettre en place).
[rpool/picturart]
        use_template = media

[template_media]
        frequently = 0
        hourly = 24
        daily = 30
        weekly = 8
        monthly = 6
        yearly = 0
        autosnap = yes
        autoprune = yes
SANOID

echo ">> Ajout du CT $CTID à la sauvegarde nocturne"
JOB=$(pvesh get /cluster/backup --output-format json | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')
VMIDS=$(pvesh get "/cluster/backup/$JOB" --output-format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["vmid"])')
case ",$VMIDS," in *",$CTID,"*) ;; *) pvesh set "/cluster/backup/$JOB" --vmid "$VMIDS,$CTID" ;; esac

echo ">> Terminé. Étape suivante : infra/server/install-runner.sh <jeton>"
