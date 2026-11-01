# Выкладка на сервер

Пошагово, для одного небольшого сервера (VPS) в России. Нужны: домен, VPS с Ubuntu 22.04 или 24.04 (2 ядра, 2 ГБ памяти, 20 ГБ диска хватит для начала) и аккаунт почтового сервиса для SMTP.

## 1. Подготовьте сервер

Зайдите по SSH под root и выполните:

```bash
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy      # ваш ключ SSH для нового пользователя
apt update && apt -y upgrade
apt -y install ufw unattended-upgrades git
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
```

Затем откройте второе окно и проверьте вход `ssh deploy@IP-сервера`. Если работает, отключите вход по паролю и под root: в `/etc/ssh/sshd_config` поставьте `PasswordAuthentication no` и `PermitRootLogin no`, затем `systemctl restart ssh`.

Включите шифрование диска в панели провайдера, если оно есть.

## 2. Домен

В DNS-записях домена создайте запись **A**: `blizkie.ваш-домен.ru` указывает на IP сервера. Подождите несколько минут, проверьте `ping blizkie.ваш-домен.ru`.

## 3. Загрузите проект

```bash
sudo mkdir -p /opt/blizkie && sudo chown deploy:deploy /opt/blizkie
git clone https://github.com/VladislavKarnaukhov/family-medcard.git /opt/blizkie
cd /opt/blizkie
```

Репозиторий приватный: создайте на GitHub ключ доступа (Settings, Deploy keys) или используйте личный токен.

## 4. Настройте `.env`

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Заполните:

```
DOMAIN=blizkie.ваш-домен.ru
APP_URL=https://blizkie.ваш-домен.ru
SMTP_HOST=...
SMTP_PORT=2525
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Близкие <no-reply@ваш-домен.ru>"
ADMIN_EMAIL=ваша@почта
```

Без почты сервер в production не запустится. Файл `.env` не попадает в git и не должен попадать никуда.

## 5. Запуск

```bash
docker compose up -d --build
docker compose ps
curl -s https://blizkie.ваш-домен.ru/health        # {"ok":true,...}
```

Первый запуск собирает приложение несколько минут. Сертификат HTTPS Caddy получит сам.

## 6. Пароль администратора

При первом запуске создаются сотрудники со случайными паролями:

```bash
docker compose exec app cat /data/staff-credentials.txt
```

Вход для сотрудников двухфакторный: после пароля приходит код на почту сотрудника (10 минут, 5 попыток). Поэтому почта администратора должна быть рабочей и защищённой. Войдите в `https://blizkie.ваш-домен.ru/staff/`, сразу смените пароль (раздел профиля), затем удалите файл:

```bash
docker compose exec app rm /data/staff-credentials.txt
```

Если вам не нужны тестовые сотрудники, отключите их в разделе команды.

## 7. Закрыть рабочее место сотрудников по IP

В `deploy/Caddyfile` уберите `#` у блока `@staff_denied`, впишите свой IP (можно несколько через пробел) и перезапустите: `docker compose restart caddy`. Если IP меняется, используйте VPN.

## 8. Копии

Приложение само делает копию базы раз в сутки в томе `blizkie-data`. Эти копии лежат на том же сервере, поэтому раз в сутки забирайте их на другой:

```bash
sudo apt -y install age rsync
age-keygen -o ~/backup.key        # приватный ключ храните НЕ на этом сервере; публичный (строка age1...) нужен ниже
crontab -e
# 30 3 * * * AGE_RECIPIENT=age1... DEST=backup@другой-сервер:/srv/blizkie /opt/blizkie/deploy/backup-offsite.sh >> /var/log/blizkie-backup.log 2>&1
```

Раз в месяц проверяйте восстановление на пустой папке: расшифруйте архив (`age -d -i backup.key`), затем `DATA_DIR=/tmp/check npm run restore -- путь/blizkie-ДАТА.db`.

## 9. Обновление

```bash
cd /opt/blizkie && git pull && docker compose up -d --build
docker compose exec app npm run audit  # раз в неделю
```

## 10. Перед тем как пускать людей

- Реквизиты оператора в `src/legal/operator.js` заполнены, тексты проверил юрист, подано уведомление в Роскомнадзор.
- Пароль администратора сменён, `staff-credentials.txt` удалён, `/staff/` закрыт по IP.
- Копия выгружается на другой сервер, восстановление проверено.
- `curl -I https://blizkie.ваш-домен.ru` показывает `strict-transport-security`, а на ssllabs.com сайт получает оценку A.
- Подключён мониторинг `/health` (например UptimeRobot) с оповещением вам на почту.
