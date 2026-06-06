# Что заменить перед запуском

Пройдитесь по списку и подставьте свои значения.

## 1. `index.html` — объект `CONFIG`

| Поле | Заглушка | Ваше значение |
|------|----------|---------------|
| `statusSlug` | `YOUR_STATUS_SLUG` | Slug Status Page в Uptime Kuma |
| `branding.title` | `YOUR_BRAND_NAME` | Название в шапке |
| `branding.logoUrl` | `https://example.com/your-logo.png` | URL логотипа (PNG) |
| `branding.supportUrl` | `https://t.me/YOUR_SUPPORT` | Ссылка на поддержку |

## 2. `config/subpage-config.json`

В конце файла, блок `brandingSettings`, и поля `metaTitle` / `metaDescription`:

- `YOUR_BRAND_NAME`
- `https://example.com/your-logo.png`
- `https://t.me/YOUR_SUPPORT`

Импортируйте файл в Remnawave Panel → Subscription Page.

## 3. `deploy/nginx-snippet.conf`

Замените **`STATUS_HOST`** на хост Status Page (например `status.example.com`).

Вставьте фрагмент в `server { }` домена **`sub.example.com`** (ваш SUB-домен).

## 4. `deploy/caddy-snippet.caddy`

То же: **`STATUS_HOST`** и свой домен сабки.

## 5. `.env` на сервере

```env
REMNAWAVE_API_TOKEN=ваш_токен_из_панели
REMNAWAVE_PANEL_URL=http://remnawave:3000
```

## 6. Проверка после деплоя

```bash
SUB_DOMAIN=sub.example.com \
SHORT_UUID=токен_из_ссылки_подписки \
USERNAME=логин_пользователя \
bash deploy/fix-hwid-on-server.sh
```
