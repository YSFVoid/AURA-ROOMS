import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { createSuccessEmbed } from '../../ui/embeds.js';
import type { AppContext } from '../../types/index.js';
import {
  assertBotPerms,
  assertInTempRoom,
  assertOwnerOrTrusted,
} from '../../utils/guards.js';
import { getRequestId } from '../../utils/requestContext.js';

export async function handleTemplateApply(
  interaction: ChatInputCommandInteraction,
  context: AppContext,
): Promise<void> {
  const { member, channel, room } = await assertInTempRoom(interaction);
  const settings = await ensureDefaults(member.guild.id);
  assertOwnerOrTrusted(member, room.ownerId, settings.trustedRoleIds);
  assertBotPerms(member, [PermissionFlagsBits.ManageChannels], channel.id);

  const templateName = interaction.options.getString('name', true);

  await context.templateService.applyTemplateToRoom({
    templateName,
    guildId: member.guild.id,
    ownerId: interaction.user.id,
    member,
    channel,
    room,
    trustedRoleIds: settings.trustedRoleIds,
  });

  await context.auditLogService.logEvent(member.guild.id, {
    action: 'template_apply',
    result: 'success',
    actorId: interaction.user.id,
    requestId: getRequestId(interaction),
    details: `Applied template=${templateName} to room=${channel.id}`,
  });

  await interaction.reply({
    embeds: [createSuccessEmbed('Template Applied', `Applied template **${templateName}**.`)],
    ephemeral: true,
  });
}
