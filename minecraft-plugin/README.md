# Minecraft Requests Plugin

Paper/Spigot plugin for request synchronization with Discord.

## Features

- Receives requests from Discord bot over HTTP API.
- Auto-whitelists player on `accepted` status if enabled in config.
- Supports SQLite and MySQL through HikariCP.
- Automatically initializes storage on startup:
  - SQLite: creates plugin data folder and DB file path.
  - MySQL: creates configured database if it does not exist.

## Build

```bash
mvn package
```

Output jar: `target/minecraft-requests-plugin-1.0.0.jar`

## Install

1. Copy jar into Paper server `plugins/`.
2. Start server once to generate `config.yml`.
3. Edit config and restart server.

## API

All API routes except health require header:

`X-API-KEY: <api.secret-key>`

### `GET /api/health`

Response:

```json
{ "ok": true }
```

### `POST /api/requests`

Creates or updates request.

Request body:

```json
{
  "id": "REQ-123",
  "playerName": "Notch",
  "edition": "Java",
  "status": "pending",
  "admin": false
}
```

### `GET /api/requests`

Returns all requests for GUI/debug integrations.

### `POST /api/requests/{id}/status`

Updates status:

```json
{
  "status": "accepted"
}
```

Allowed values: `accepted`, `rejected`, `pending`.

## Config example

Use `src/main/resources/config.yml` as template.

