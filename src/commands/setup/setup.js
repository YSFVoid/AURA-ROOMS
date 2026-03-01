import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { Branding } from '../../config/constants.js';
import { createErrorEmbed, createSuccessEmbed } from '../../ui/embeds.js';
import { createSetupActionButtons } from '../../ui/components.js';
import { sendSetupExport } from '../config/export.js';
import { getRequestId } from '../../utils/requestContext.js';

export const setupCommand = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Auto-setup AURA Rooms (creates category, log, lobby)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, context) {
        if (!interaction.inGuild() || !interaction.memberPermissions) {
            await interaction.reply({
                embeds: [createErrorEmbed('Setup', 'This command can only be used inside a server.')],
                ephemeral: true,
            });
            return;
        }

        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                embeds: [createErrorEmbed('Setup', 'Administrator permission is required.')],
                ephemeral: true,
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const result = await context.setupService.run(interaction.guild);

        if (!result.ok) {
            if (result.missingPermissions?.length > 0) {
                await interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            'Setup Failed',
                            `Bot is missing permissions:\n${result.missingPermissions.map((p) => `• ${p}`).join('\n')}`,
                        ),
                    ],
                });
                return;
            }

            await interaction.editReply({
                embeds: [createErrorEmbed('Setup Failed', 'An error occurred during setup. Please try again.')],
            });
            return;
        }

        await interaction.editReply({
            embeds: [
                createSuccessEmbed(`${Branding.NAME} Setup Complete`, 'Your server is ready to go!', [
                    { name: 'Category', value: result.category?.toString() ?? 'N/A', inline: true },
                    { name: 'Log Channel', value: result.logChannel?.toString() ?? 'N/A', inline: true },
                    { name: 'Lobby', value: result.lobbyChannel?.toString() ?? 'N/A', inline: true },
                ]),
            ],
            components: [createSetupActionButtons()],
        });

        await context.auditLogService.logEvent(interaction.guildId, {
            eventType: 'SETUP_WIZARD_RUN',
            result: 'success',
            actorId: interaction.user.id,
            requestId: getRequestId(interaction),
            details: 'Setup completed successfully.',
            level: 'minimal',
        });
    },
};

export const setupButtonHandlers = [
    {
        customId: 'setup:post-lobby-info',
        async execute(interaction, _context) {
            if (!interaction.guildId) return;

            await interaction.reply({
                embeds: [
                    createSuccessEmbed(
                        'Lobby Info',
                        'Join the **➕ Create Room** voice channel to create your own temporary voice room.\n\nUse `/room panel` inside your room to manage it.',
                    ),
                ],
                ephemeral: true,
            });
        },
    },
    {
        customId: 'setup:export-config',
        async execute(interaction, context) {
            await sendSetupExport(interaction, context);
        },
    },
    {
        customId: 'setup:open-room-panel',
        async execute(interaction) {
            await interaction.reply({
                embeds: [
                    createSuccessEmbed(
                        'Room Panel Help',
                        'Use `/room panel` while inside your temp voice room to open the control panel.\n\nFrom there you can rename, set limits, change privacy, kick members, apply templates, and more.',
                    ),
                ],
                ephemeral: true,
            });
        },
    },
];
