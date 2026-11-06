#!/usr/bin/env bash
# Сохраняет изменения в GitHub. Запуск: bash push.sh "что изменил"
set -e
cd "$(dirname "$0")"

MSG="${1:-update}"
TOKEN=$(grep '^GITHUB_PASSWORD=' ../meetup/.env | cut -d= -f2- | tr -d '"' | tr -d '\r\n')
[ -n "$TOKEN" ] || { echo "нет токена в ../meetup/.env"; exit 1; }

git add -A
git -c user.name=qualbyy -c user.email=qualbyy@users.noreply.github.com commit -q -m "$MSG" || echo "нечего сохранять"
git -c "http.https://github.com/.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)" push -q origin main
echo "готово: https://qualbyy.github.io/qplate/ (обновится через минуту)"
