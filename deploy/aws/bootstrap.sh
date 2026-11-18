#!/usr/bin/env bash
# Idempotent Ubuntu 22.04 / 24.04 bootstrap script for AWS EC2 t3.small (2 GB RAM)
# Installs Docker Engine + Compose plugin, configures 4 GB swap, sets up UFW firewall,
# and prints your ready-to-use sslip.io HTTPS hostname.
set -euo pipefail

echo "==> [1/4] Installing Docker Engine & Docker Compose plugin..."
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg ufw
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo "Docker installed. (Note: log out & back in or run 'newgrp docker' to use docker without sudo.)"
else
  echo "Docker already installed: $(docker --version)"
fi

echo "==> [2/4] Ensuring 4 GB swapfile for safe demo parsing on 2 GB RAM..."
if ! swapon --show | grep -q '/swapfile'; then
  if [ ! -f /swapfile ]; then
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi
  sudo swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
  sudo sysctl -w vm.swappiness=20 >/dev/null
  if ! grep -q '^vm.swappiness=' /etc/sysctl.conf; then
    echo 'vm.swappiness=20' | sudo tee -a /etc/sysctl.conf >/dev/null
  fi
  echo "4 GB swapfile active."
else
  echo "Swapfile already active."
fi

echo "==> [3/4] Configuring UFW firewall (ports 22, 80, 443)..."
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw allow 443/udp >/dev/null
sudo ufw --force enable >/dev/null
sudo ufw status

echo "==> [4/4] Detecting EC2 Public IPv4 for instant sslip.io HTTPS..."
IMDS_TOKEN=$(curl -sS --max-time 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
PUBLIC_IP=""
if [ -n "$IMDS_TOKEN" ]; then
  PUBLIC_IP=$(curl -sS --max-time 2 -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" "http://169.254.169.254/latest/meta-data/public-ipv4" || true)
fi
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP=$(curl -sS --max-time 5 https://checkip.amazonaws.com || true)
fi

echo ""
echo "======================================================================"
echo " Bootstrap complete!"
if [ -n "$PUBLIC_IP" ]; then
  DASHED_IP="${PUBLIC_IP//./-}"
  echo " Detected Public IPv4 : ${PUBLIC_IP}"
  echo " Suggested .env entry : API_DOMAIN=${DASHED_IP}.sslip.io"
  echo " Backend HTTPS URL    : https://${DASHED_IP}.sslip.io"
fi
echo " Next step: edit .env, then run:"
echo "   docker compose --env-file .env -f deploy/aws/docker-compose.backend.yml up -d --build"
echo "======================================================================"
