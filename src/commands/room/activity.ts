import type { ChatInputCommandInteraction } from 'discord.js';
import { SafeLimits } from '../../config/safeLimits.js';
import { ensureDefaults } from '../../db/repos/guildSettingsRepo.js';
import { updateRoomSettings } from '../../db/repos/roomsRepo.js';
import type { AppContext } from '../../types/index.js';
import { createSuccessEmbed } from '../../ui/embeds.js';
import { ValidationError } from '../../utils/errors.js';
import { assertInTempRoom, assertOwnerOrTrusted } from '../../utils/guards.js';

export async function handleRoomActivity(
  interaction: ChatInputCommandInteraction,
  _context: AppContext,
): Promise<void> {
  const { member, room } = await assertInTempRoom(interaction);
  const settings = await ensureDefaults(member.guild.id);
  assertOwnerOrTrusted(member, room.ownerId, settings.trustedRoleIds);

  const rawTag = interaction.options.getString('tag');
  const tag = rawTag ? rawTag.trim() : undefined;
  if (tag && tag.length > SafeLimits.MAX_ACTIVITY_TAG_LEN) {
    throw new ValidationError(
      `Activity must be at most ${SafeLimits.MAX_ACTIVITY_TAG_LEN} characters.`,
    );
  }

  const autoNameEnabled = interaction.options.getBoolean('autoname') ?? room.autoNameEnabled;

  await updateRoomSettings(room.channelId, {
    activityTag: tag && tag.length > 0 ? tag : undefined,
    autoNameEnabled,
    lastActiveAt: new Date(),
  });

  await interaction.reply({
    embeds: [
      createSuccessEmbed('Room Activity Updated', 'Room activity settings were updated.', [
        { name: 'Activity', value: tag ?? 'None', inline: true },
        { name: 'Auto Name', value: autoNameEnabled ? 'Enabled' : 'Disabled', inline: true },
      ]),
    ],
    ephemeral: true,
  });
}
