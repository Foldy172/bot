# Discord Requests Bot

Discord bot (`discord.js`) for collecting and moderating Minecraft whitelist requests.

## Features

- On startup creates or updates pinned channel message with button `📩 Подать заявку`.
- Button opens modal with:
  - Minecraft nickname
  - Edition (`Java` or `Bedrock`)
- After submit:
  - creates unique request ID;
  - sends request embed to moderation channel;
  - synchronizes request to Minecraft plugin API.
- Embed has moderation buttons:
  - `✅ Accept` -> updates plugin status and embed (`Accepted by Moderator`).
  - `❌ Reject` -> updates plugin status and embed (`Rejected by Moderator`).
- Repeated click protection through status locking and disabled buttons.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill all required values.
3. Install dependencies:

```bash
npm install
```

4. Run:

```bash
npm start
```

## Environment variables

- `DISCORD_TOKEN` - bot token.
- `CLIENT_ID` - optional for future slash command extension.
- `GUILD_ID` - guild/server id.
- `CHANNEL_ID` - legacy single-channel fallback (used when specific channel IDs are not set).
- `ENTRY_CHANNEL_ID` - channel where bot creates/updates the pinned `📩 Подать заявку` message.
- `REQUESTS_CHANNEL_ID` - channel where submitted requests are posted for moderation.
- `PINNED_MESSAGE_ID` - optional existing pinned message id.
- `MC_API_BASE_URL` - plugin API base URL.
- `MC_API_SECRET` - plugin API secret key.
- `REQUESTS_DB_PATH` - local JSON persistence path.

## API integration

The bot sends:

- `POST /api/requests` for new request.
- `POST /api/requests/{id}/status` for moderation decisions.

Auth header:

`X-API-KEY: <MC_API_SECRET>`

