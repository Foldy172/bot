import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
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

function editionPickerComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("request_pick_edition:Java").setLabel("[🖥️] Java").setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("request_pick_edition:Bedrock")
        .setLabel("[📱] Bedrock")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function ensurePinnedMessage() {
  const channel = await client.channels.fetch(config.entryChannelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Канал подачи заявки недоступен или не текстовый");
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
      content: "Нажмите кнопку ниже, чтобы подать заявку",
      components: createEntryMessageComponents()
    });
    try {
      await message.pin();
    } catch (error) {
      console.warn("Не удалось закрепить сообщение (нет прав Manage Messages?)", error?.code ?? error);
    }
    console.log(`Создано закрепленное сообщение: ${message.id}. Сохраните ID в PINNED_MESSAGE_ID.`);
  } else {
    await message.edit({
      content: "Нажмите кнопку ниже, чтобы подать заявку.",
      components: createEntryMessageComponents()
    });
    const pinned = await channel.messages.fetchPins();
    if (!pinned.has(message.id)) {
      try {
        await message.pin();
      } catch (error) {
        console.warn("Не удалось закрепить сообщение (нет прав Manage Messages?)", error?.code ?? error);
      }
    }
  }
}

client.once(Events.ClientReady, async () => {
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
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content:
            "Выберите версию Minecraft, затем откроется форма с ником.\n" +
            "--------------------------------------\n" +
            "Вводите ник с УЧЁТОМ регистра букв.\n" +
            "Пример: Ваш ник - Foldy.\n" +
            "[❌] foldy, fOldy, fOLDY\n" +
            "[✅] Foldy\n" +
            "---------------------------------------\n" +
            "Версия сервера: 1.21.11\n" +
            "Сервер: `178.215.238.90:42069`\n" +
            "Сервер для телефона: `178.215.238.90` `42067`\n" +
            "---------------------------------------\n" +
            "Заявка будет отправлена в канал модерации.",

          components: editionPickerComponents()
        });
        return;
      }

      if (interaction.customId.startsWith("request_pick_edition:")) {
        const edition = interaction.customId.split(":")[1];
        const modal = new ModalBuilder().setCustomId(`request_modal:${edition}`).setTitle("Подача заявки");
        const nickname = new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("Ник в Minecraft")
          .setPlaceholder("Например: Steve")
          .setRequired(true)
          .setMaxLength(16)
          .setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(nickname));
        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId.startsWith("request_accept:") || interaction.customId.startsWith("request_reject:")) {
        if (!config.moderatorIds.includes(interaction.user.id)) {
          await interaction.reply({
            content: "У вас нет прав на принятие и отклонение заявок.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.deferUpdate();
        const [action, requestId] = interaction.customId.split(":");
        const request = store.getById(requestId);
        if (!request) {
          await interaction.followUp({ content: "Заявка не найдена.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (request.status !== "PENDING") {
          await interaction.followUp({ content: "Эта заявка уже обработана.", flags: MessageFlags.Ephemeral });
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

    if (interaction.isModalSubmit() && interaction.customId.startsWith("request_modal:")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const nickname = interaction.fields.getTextInputValue("nickname").trim();
      const pickedEdition = interaction.customId.split(":")[1];
      const edition = pickedEdition === "Bedrock" ? "[📱] Bedrock" : "[🖥️] Java";
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
        admin: request.admin,
        createdByDiscordId: interaction.user.id,
        createdByDiscordName: interaction.user.username
      });

      const channel = await client.channels.fetch(config.requestsChannelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Канал модерации недоступен или не текстовый");
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
      await interaction.reply({ content: "Ошибка обработки запроса.", flags: MessageFlags.Ephemeral });
    } else if (interaction.isRepliable() && interaction.deferred) {
      await interaction.editReply({ content: "Ошибка обработки запроса." });
    }
  }
});

client.login(config.token);

