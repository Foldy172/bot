import {
  ActionRowBuilder,
  Client,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { createEntryMessageComponents, moderationButtons, requestEmbed } from "./embeds.js";
import { McApiClient } from "./mcApi.js";
import { RequestStore } from "./store.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const store = new RequestStore(config.dbPath);
const mcApi = new McApiClient(config.mcApiBaseUrl, config.mcApiSecret);

async function ensurePinnedMessage() {
  const channel = await client.channels.fetch(config.entryChannelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Configured entry channel is not text-based");
  }

  let message = null;
  if (config.pinnedMessageId) {
    try {
      message = await channel.messages.fetch(config.pinnedMessageId);
    } catch {
      message = null;
    }
  }

  if (!message) {
    message = await channel.send({
      content: "Нажмите кнопку ниже, чтобы подать заявку на whitelist.",
      components: createEntryMessageComponents()
    });
    await message.pin();
    console.log(`Created pinned message: ${message.id}. Save as PINNED_MESSAGE_ID in .env`);
  } else {
    await message.edit({
      content: "Нажмите кнопку ниже, чтобы подать заявку на whitelist.",
      components: createEntryMessageComponents()
    });
    const pinned = await channel.messages.fetchPinned();
    if (!pinned.has(message.id)) {
      await message.pin();
    }
  }
}

client.once("ready", async () => {
  try {
    await store.load();
    console.log(`Logged in as ${client.user.tag}`);
    await ensurePinnedMessage();
  } catch (error) {
    console.error("startup error", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "request_open_modal") {
        const modal = new ModalBuilder().setCustomId("request_modal").setTitle("Whitelist request");
        const nickname = new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("Minecraft nickname")
          .setRequired(true)
          .setMaxLength(16)
          .setStyle(TextInputStyle.Short);
        const edition = new TextInputBuilder()
          .setCustomId("edition")
          .setLabel("Edition: Java / Bedrock")
          .setRequired(true)
          .setMaxLength(16)
          .setStyle(TextInputStyle.Short);
        modal.addComponents(
          new ActionRowBuilder().addComponents(nickname),
          new ActionRowBuilder().addComponents(edition)
        );
        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId.startsWith("request_accept:") || interaction.customId.startsWith("request_reject:")) {
        await interaction.deferUpdate();
        const [action, requestId] = interaction.customId.split(":");
        const request = store.getById(requestId);
        if (!request) {
          await interaction.followUp({ content: "Request not found.", ephemeral: true });
          return;
        }
        if (request.status !== "PENDING") {
          await interaction.followUp({ content: "This request has already been processed.", ephemeral: true });
          return;
        }
        const status = action === "request_accept" ? "ACCEPTED" : "REJECTED";
        const moderator = interaction.user.username;
        await store.update(requestId, {
          status,
          moderatedBy: moderator,
          updatedAt: new Date().toISOString()
        });

        if (status === "ACCEPTED") {
          await mcApi.updateStatus(requestId, "accepted");
        } else {
          await mcApi.updateStatus(requestId, "rejected");
        }

        const updated = store.getById(requestId);
        await interaction.message.edit({
          embeds: [requestEmbed(updated)],
          components: moderationButtons(requestId, true)
        });
        return;
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "request_modal") {
      await interaction.deferReply({ ephemeral: true });
      const nickname = interaction.fields.getTextInputValue("nickname").trim();
      const editionRaw = interaction.fields.getTextInputValue("edition").trim();
      const edition = editionRaw.toLowerCase().includes("bedrock") ? "Bedrock" : "Java";
      const id = `REQ-${Date.now()}-${nanoid(5).toUpperCase()}`;
      const request = {
        id,
        nickname,
        edition,
        status: "PENDING",
        admin: false,
        moderatedBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByDiscordId: interaction.user.id
      };
      await store.create(request);
      await mcApi.createOrSyncRequest({
        id: request.id,
        playerName: request.nickname,
        edition: request.edition,
        status: "pending",
        admin: request.admin
      });

      const channel = await client.channels.fetch(config.requestsChannelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Configured requests channel is not text-based");
      }
      await channel.send({
        embeds: [requestEmbed(request)],
        components: moderationButtons(id)
      });
      await interaction.editReply({ content: `Заявка создана: ${id}` });
    }
  } catch (error) {
    console.error("interaction error", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Ошибка обработки запроса.", ephemeral: true });
    } else if (interaction.isRepliable() && interaction.deferred) {
      await interaction.editReply({ content: "Ошибка обработки запроса." });
    }
  }
});

client.login(config.token);

