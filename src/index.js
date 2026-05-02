import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
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

const moderationLocks = new Map();

function isModerator(userId) {
  return config.moderatorIds.includes(userId);
}

function formatBlacklistEntry(entry) {
  if (typeof entry === "string") {
    return `<@${entry}> (\`${entry}\`) — навсегда`;
  }
  const id = entry.discordUserId;
  const until = entry.expiresAt ? `до **${new Date(entry.expiresAt).toLocaleString("ru-RU")}**` : "навсегда";
  const reason = entry.reason ? `\nПричина: ${entry.reason}` : "";
  return `<@${id}> (\`${id}\`) — ${until}${reason}`;
}

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
    const isPinned =
      typeof pinned?.has === "function"
        ? pinned.has(message.id)
        : Array.isArray(pinned)
          ? pinned.some((m) => m?.id === message.id)
          : false;
    if (!isPinned) {
      try {
        await message.pin();
      } catch (error) {
        console.warn("Не удалось закрепить сообщение (нет прав Manage Messages?)", error?.code ?? error);
      }
    }
  }
}

async function ensureCommands() {
  const guild = await client.guilds.fetch(config.guildId);
  await guild.commands.set([
    {
      name: "whitelistremove",
      description: "Убрать игрока из whitelist на Minecraft сервере",
      options: [
        {
          name: "nickname",
          description: "Ник игрока в Minecraft",
          type: ApplicationCommandOptionType.String,
          required: true
        }
      ]
    },
    {
      name: "blacklist",
      description: "Запретить/разрешить пользователю создавать заявки",
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "add",
          description: "Запретить пользователю создавать заявки",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Пользователь Discord",
              required: true
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "minutes",
              description: "Срок блокировки в минутах (если не указать — навсегда)",
              required: false,
              min_value: 1
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "reason",
              description: "Причина (опционально)",
              required: false
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "remove",
          description: "Разрешить пользователю снова создавать заявки",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Пользователь Discord",
              required: true
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "list",
          description: "Показать список пользователей в blacklist"
        }
      ]
    }
  ]);
}

client.once(Events.ClientReady, async () => {
  try {
    await store.load();
    console.log(`Logged in as ${client.user.tag}`);
    await ensureCommands();
    await ensurePinnedMessage();
  } catch (error) {
    console.error("startup error", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "whitelistremove") {
        if (!isModerator(interaction.user.id)) {
          await interaction.reply({ content: "У вас нет прав на эту команду.", flags: MessageFlags.Ephemeral });
          return;
        }
        const nickname = interaction.options.getString("nickname", true).trim();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await mcApi.whitelistRemove(nickname);
        await interaction.editReply({ content: `Готово. Убрал из whitelist: ${nickname}` });
        return;
      }

      if (interaction.commandName === "blacklist") {
        if (!isModerator(interaction.user.id)) {
          await interaction.reply({ content: "У вас нет прав на эту команду.", flags: MessageFlags.Ephemeral });
          return;
        }

        const subcommand = interaction.options.getSubcommand(true);

        if (subcommand === "list") {
          await store.pruneExpiredBlacklist();
          const entries = store.listBlacklist();
          const body = entries.length ? entries.map(formatBlacklistEntry).join("\n\n") : "Список пуст.";
          await interaction.reply({ content: body, flags: MessageFlags.Ephemeral });
          return;
        }

        const user = interaction.options.getUser("user", true);
        if (subcommand === "add") {
          const minutes = interaction.options.getInteger("minutes", false);
          const reason = interaction.options.getString("reason", false);
          await store.addToBlacklist(user.id, { minutes: minutes ?? null, reason: reason ?? null, addedBy: interaction.user.id });
          const untilText =
            typeof minutes === "number" && minutes > 0
              ? `на **${minutes}** мин. (до ${new Date(Date.now() + minutes * 60_000).toLocaleString("ru-RU")})`
              : "навсегда";
          await interaction.reply({
            content: `Добавил в blacklist: <@${user.id}> (\`${user.id}\`) — ${untilText}${reason ? `\nПричина: ${reason}` : ""}`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        if (subcommand === "remove") {
          await store.removeFromBlacklist(user.id);
          await interaction.reply({
            content: `Убрал из blacklist: <@${user.id}> (\`${user.id}\`)`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "request_open_modal") {
        if (await store.isBlacklisted(interaction.user.id)) {
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "Вам запрещено создавать заявки. Если это ошибка — обратитесь к модератору."
          });
          return;
        }
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
        if (!isModerator(interaction.user.id)) {
          await interaction.reply({
            content: "У вас нет прав на принятие и отклонение заявок.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.deferUpdate();
        const [action, requestId] = interaction.customId.split(":");
        if (moderationLocks.has(requestId)) {
          await interaction.followUp({ content: "Эта заявка уже обрабатывается.", flags: MessageFlags.Ephemeral });
          return;
        }
        moderationLocks.set(requestId, true);
        const request = store.getById(requestId);
        if (!request) {
          moderationLocks.delete(requestId);
          await interaction.followUp({ content: "Заявка не найдена.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (request.status !== "PENDING") {
          moderationLocks.delete(requestId);
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

        try {
          if (status === "ACCEPTED") {
            await mcApi.updateStatus(requestId, "accepted");
          } else {
            await mcApi.updateStatus(requestId, "rejected");
          }
        } catch (mcError) {
          console.warn("MC API updateStatus failed", mcError?.code ?? mcError);
          await interaction.followUp({
            content: "Статус в Discord обновлён, но синхронизация с Minecraft API не удалась (попробуйте позже).",
            flags: MessageFlags.Ephemeral
          });
        }

        const updated = store.getById(requestId);
        try {
          await interaction.message.edit({
            embeds: [requestEmbed(updated)],
            components: moderationButtons(requestId, true)
          });
        } catch (editError) {
          console.warn("Не удалось обновить сообщение заявки", editError?.code ?? editError);
        }

        // Notify applicant in DM
        if (updated?.createdByDiscordId) {
          try {
            const user = await client.users.fetch(updated.createdByDiscordId);
            const verdict = status === "ACCEPTED" ? "✅ **принята**" : "❌ **отклонена**";
            await user.send(
              `Ваша заявка **${updated.id}** (${updated.edition}, ник: **${updated.nickname}**) ${verdict}.\n` +
                `Модератор: **${moderator}**`
            );
          } catch (notifyError) {
            console.warn("Не удалось отправить уведомление в ЛС (возможно, закрыты ЛС)", notifyError?.code ?? notifyError);
          }
        }
        moderationLocks.delete(requestId);
        return;
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("request_modal:")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (await store.isBlacklisted(interaction.user.id)) {
        await interaction.editReply({
          content: "Вам запрещено создавать заявки. Если это ошибка — обратитесь к модератору."
        });
        return;
      }
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
        createdByDiscordId: interaction.user.id,
        createdByDiscordName: interaction.user.username
      };
      await store.create(request);
      let mcSyncOk = true;
      try {
        await mcApi.createOrSyncRequest({
          id: request.id,
          playerName: request.nickname,
          edition: request.edition,
          status: "pending",
          admin: request.admin,
          createdByDiscordId: interaction.user.id,
          createdByDiscordName: interaction.user.username
        });
      } catch (mcError) {
        mcSyncOk = false;
        console.warn("MC API createOrSyncRequest failed", mcError?.code ?? mcError);
      }

      const channel = await client.channels.fetch(config.requestsChannelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Канал модерации недоступен или не текстовый");
      }
      await channel.send({
        embeds: [requestEmbed(request)],
        components: moderationButtons(id)
      });
      await interaction.editReply({
        content: mcSyncOk ? `Заявка создана: ${id}` : `Заявка создана: ${id}\nНо синхронизация с Minecraft API временно недоступна.`
      });
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

