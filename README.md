
# Custom SubPage для Remnawave

<p align="center">
<picture>
  <img alt="Demonstration Page" src="https://raw.githubusercontent.com/DeL1TMe/relaks-subpage/refs/heads/master/Demonstration.jpg" width="40%">
</picture>
</p>

Кастомная страница подписки Remnawave: один экран со всем нужным пользователю.

**Перед деплоем откройте [SETUP.md](SETUP.md)** — там список всех полей, которые нужно заменить.

## Что на странице

1. Шапка с логотипом и названием сервиса
2. Карточка пользователя — имя, статус, срок, трафик
3. Установка — инструкции для VPN-клиентов (из конфига панели)
4. Статус серверов — uptime с Uptime Kuma
5. Устройства — счётчик HWID и удаление всех устройств
6. Ссылка на поддержку

## Состав репозитория

| Путь | Назначение |
|------|------------|
| `index.html` | Custom template для `remnawave/subscription-page` |
| `hwid-proxy/` | Прокси к HWID API панели |
| `docker-compose.yml` | Subscription page + hwid-proxy |
| `config/subpage-config.json` | Конфиг SubPage для импорта в панель |
| `deploy/` | Фрагменты Nginx/Caddy и скрипт проверки |
| `SETUP.md` | Чеклист настройки под себя |

## Схема

```
Браузер
  → sub.example.com/TOKEN     → subscription-page (index.html)
  → sub.example.com/status-api/…  → Uptime Kuma
  → sub.example.com/hwid-api/…    → hwid-proxy → Panel API
```

## Требования

- Remnawave Panel с Subscription Page
- Docker, сеть `remnawave-network`
- Nginx или Caddy
- Uptime Kuma со Status Page
- API-токен панели (users + hwid)

## Установка

```bash
sudo mkdir -p /opt/remnawave/subscription
sudo cp index.html docker-compose.yml .env.example /opt/remnawave/subscription/
sudo cp -r hwid-proxy deploy config /opt/remnawave/subscription/

cd /opt/remnawave/subscription
cp .env.example .env
# заполните REMNAWAVE_API_TOKEN

docker compose up -d --build
```

Дальше — прокси из `deploy/`, импорт `config/subpage-config.json` в панель, правки `CONFIG` в `index.html`. Подробно в [SETUP.md](SETUP.md).

## Проверка

| URL | Ожидание |
|-----|----------|
| `https://sub.example.com/SHORT_UUID` | Страница с данными пользователя |
| `https://sub.example.com/status-api/api/status-page/YOUR_STATUS_SLUG` | JSON |
| `https://sub.example.com/hwid-api/health` | `{"ok":true}` |
| `https://sub.example.com/hwid-api/ready` | `{"ok":true,...}` |

## Безопасность

- Токен панели только в `.env` на сервере
- Не коммитьте `.env` и ключи SSH
- После утечки ссылки подписки — перевыпустите её в панели
