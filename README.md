# Discord Requests Bot

MADE WITH CURSOR AI

Discord-бот (`discord.js`) для сбора и модерации заявок в вайтлист

## Features

- При запуске создаёт/обновляет закреплённое сообщение с кнопкой `📩 Подать заявку`.
- После нажатия показывает кнопки выбора версии:
  - `[🖥️] Java`
  - `[📱] Bedrock`
- Затем открывает форму с полем ника.
- После отправки:
  - создаёт уникальный ID заявки;
  - отправляет embed в канал модерации;
  - синхронизирует заявку с API Minecraft-плагина.
- Под заявкой есть кнопки:
  - `✅ Принять`
  - `❌ Отклонить`
- Обработка защищена от повторного нажатия.

## Setup

1. Скопируйте `.env.example` в `.env`.
2. Заполните все обязательные значения.
3. Установите зависимости:

```bash
npm install
```

4. Запустите:

```bash
npm start
```

## Environment variables

- `DISCORD_TOKEN` - токен бота.
- `CLIENT_ID` - ID приложения (опционально).
- `GUILD_ID` - ID сервера Discord.
- `CHANNEL_ID` - fallback-канал, если не заданы отдельные ID.
- `ENTRY_CHANNEL_ID` - канал подачи заявки (закреп с кнопкой).
- `REQUESTS_CHANNEL_ID` - канал модерации (куда приходят заявки).
- `PINNED_MESSAGE_ID` - ID закреплённого сообщения (опционально).
- `MODERATOR_IDS` - список ID модераторов через запятую, которые могут принимать/отклонять заявки.
- `MC_API_BASE_URL` - URL API Minecraft-плагина.
- `MC_API_SECRET` - API-ключ Minecraft-плагина.
- `REQUESTS_DB_PATH` - путь к локальному JSON-хранилищу.

## API integration

Бот отправляет:

- `POST /api/requests` для новой заявки.
- `POST /api/requests/{id}/status` для решения модерации.

Заголовок авторизации:

`X-API-KEY: <MC_API_SECRET>`

