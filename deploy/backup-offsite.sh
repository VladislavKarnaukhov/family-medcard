#!/usr/bin/env bash
# Ночная выгрузка копий на другой сервер. Запуск из cron на сервере с приложением:
#   30 3 * * * /opt/blizkie/deploy/backup-offsite.sh >> /var/log/blizkie-backup.log 2>&1
# Нужно: age (шифрование), rsync, ключ SSH к серверу копий.
# Задайте переменные: AGE_RECIPIENT (публичный ключ age), DEST (user@host:/путь/blizkie-backups).
set -euo pipefail
: "${AGE_RECIPIENT:?укажите публичный ключ age}"
: "${DEST:?укажите место назначения, например backup@host:/srv/blizkie}"
DAY=$(date +%F)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# Свежая копия базы и файлов лежит в томе приложения (создаётся приложением раз в сутки).
docker compose cp "app:/data/backups/blizkie-$DAY.db" "$TMP/blizkie-$DAY.db"
docker compose cp "app:/data/backups/uploads" "$TMP/uploads"
tar -C "$TMP" -cf - . | age -r "$AGE_RECIPIENT" > "$TMP/blizkie-$DAY.tar.age"
rsync -a "$TMP/blizkie-$DAY.tar.age" "$DEST/"
echo "$(date -Is) выгружено blizkie-$DAY.tar.age"
