#!/usr/bin/env bash
set -euo pipefail

SUB_DOMAIN="${SUB_DOMAIN:-sub.example.com}"
SHORT_UUID="${SHORT_UUID:-}"
USERNAME="${USERNAME:-}"

cd /opt/remnawave/subscription

docker compose up -d --build hwid-proxy
docker compose restart remnawave-subscription-page

echo "health:"
curl -sS "https://${SUB_DOMAIN}/hwid-api/health"
echo

echo "ready:"
curl -sS "https://${SUB_DOMAIN}/hwid-api/ready"
echo

if [[ -n "${SHORT_UUID}" ]]; then
  qs="shortUuid=${SHORT_UUID}"
  [[ -n "${USERNAME}" ]] && qs="${qs}&username=${USERNAME}"
  echo "devices:"
  curl -sS "https://${SUB_DOMAIN}/hwid-api/devices?${qs}"
  echo
fi

docker logs hwid-proxy --tail=30
