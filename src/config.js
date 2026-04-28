import dotenv from "dotenv";

dotenv.config();

function requireVar(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  token: requireVar("DISCORD_TOKEN"),
  guildId: requireVar("GUILD_ID"),
  entryChannelId: process.env.ENTRY_CHANNEL_ID || process.env.CHANNEL_ID || requireVar("CHANNEL_ID"),
  requestsChannelId: process.env.REQUESTS_CHANNEL_ID || process.env.CHANNEL_ID || requireVar("CHANNEL_ID"),
  pinnedMessageId: process.env.PINNED_MESSAGE_ID || null,
  mcApiBaseUrl: requireVar("MC_API_BASE_URL"),
  mcApiSecret: requireVar("MC_API_SECRET"),
  dbPath: process.env.REQUESTS_DB_PATH || "./data/requests.json"
};

