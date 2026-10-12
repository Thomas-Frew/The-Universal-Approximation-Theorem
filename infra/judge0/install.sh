#!/usr/bin/env bash
# Installs Judge0 CE on a fresh Ubuntu 22.04 droplet. Run as root, twice:
# the first run switches the machine to cgroup v1 and reboots, the second
# installs and starts Judge0.
#
#   scp infra/judge0/install.sh root@<ip>:/root/ && ssh root@<ip> bash /root/install.sh
#
# Judge0 listens on 127.0.0.1:2358 only. Reach it from a laptop with
#   ssh -N -L 2358:127.0.0.1:2358 root@<ip>
# In production, change the port binding to the droplet's private VPC address.
set -euo pipefail

JUDGE0_VERSION=1.13.1
DIR=/opt/judge0-v$JUDGE0_VERSION

# Judge0's sandbox (isolate) needs cgroup v1; Ubuntu 22.04 boots with v2.
if [ "$(stat -fc %T /sys/fs/cgroup)" = cgroup2fs ]; then
  echo 'GRUB_CMDLINE_LINUX="$GRUB_CMDLINE_LINUX systemd.unified_cgroup_hierarchy=0"' \
    > /etc/default/grub.d/99-judge0-cgroup-v1.cfg
  update-grub
  echo "Switched to cgroup v1. Rebooting; run this script again afterwards."
  systemctl reboot
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
apt-get -o DPkg::Lock::Timeout=120 install -y unzip

if [ ! -d "$DIR" ]; then
  cd /opt
  wget -q "https://github.com/judge0/judge0/releases/download/v$JUDGE0_VERSION/judge0-v$JUDGE0_VERSION.zip"
  unzip -q "judge0-v$JUDGE0_VERSION.zip"
  cd "$DIR"
  # Passwords for Judge0's own Redis and Postgres, generated here and kept here.
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -hex 24)|" judge0.conf
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" judge0.conf
  sed -i "s|^JUDGE0_TELEMETRY_ENABLE=.*|JUDGE0_TELEMETRY_ENABLE=false|" judge0.conf
  # Docker publishes ports past the firewall, so bind to localhost explicitly.
  sed -i 's|- "2358:2358"|- "127.0.0.1:2358:2358"|' docker-compose.yml
fi

cd "$DIR"
docker compose up -d db redis
sleep 10
docker compose up -d
for _ in $(seq 1 30); do
  if curl -sf localhost:2358/about; then echo; echo "Judge0 is up."; exit 0; fi
  sleep 3
done
echo "Judge0 did not answer on localhost:2358" >&2
exit 1
