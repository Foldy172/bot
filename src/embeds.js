import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

export function createEntryMessageComponents() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("request_open_modal").setLabel("📩 Подать заявку").setStyle(ButtonStyle.Primary)
  );
  return [row];
}

export function requestEmbed(request) {
  const embed = new EmbedBuilder()
    .setTitle("Minecraft Request")
    .setColor(request.status === "ACCEPTED" ? 0x2ecc71 : request.status === "REJECTED" ? 0xe74c3c : 0xf1c40f)
    .addFields(
      { name: "ID", value: request.id, inline: true },
      { name: "Nickname", value: request.nickname, inline: true },
      { name: "Edition", value: request.edition, inline: true },
      { name: "Status", value: request.status, inline: false }
    )
    .setTimestamp(new Date(request.createdAt));

  if (request.moderatedBy) {
    embed.addFields({
      name: "Moderation",
      value: `${request.status} by ${request.moderatedBy}`,
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
        .setLabel("✅ Accept")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`request_reject:${id}`)
        .setLabel("❌ Reject")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    )
  ];
}

