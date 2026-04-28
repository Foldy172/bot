import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

export function createEntryMessageComponents() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("request_open_modal").setLabel("📩 Подать заявку").setStyle(ButtonStyle.Primary)
  );
  return [row];
}

export function requestEmbed(request) {
  const embed = new EmbedBuilder()
    .setTitle("Заявка на whitelist")
    .setColor(request.status === "ACCEPTED" ? 0x2ecc71 : request.status === "REJECTED" ? 0xe74c3c : 0xf1c40f)
    .addFields(
      { name: "ID", value: request.id, inline: true },
      { name: "Ник", value: request.nickname, inline: true },
      { name: "Версия", value: request.edition, inline: true },
      {
        name: "Автор",
        value: request.createdByDiscordId
          ? `<@${request.createdByDiscordId}>${request.createdByDiscordName ? ` (${request.createdByDiscordName})` : ""}`
          : (request.createdByDiscordName ?? "—"),
        inline: false
      },
      { name: "Статус", value: request.status, inline: false }
    )
    .setTimestamp(new Date(request.createdAt));

  if (request.moderatedBy) {
    embed.addFields({
      name: "Модерация",
      value: `${request.status} — ${request.moderatedBy}`,
      inline: false
    });
  }
  return embed;
}

export function moderationButtons(id, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`request_accept:${id}`)
        .setLabel("✅ Принять")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`request_reject:${id}`)
        .setLabel("❌ Отклонить")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    )
  ];
}

