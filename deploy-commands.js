import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { SafeLimits } from './src/config/safeLimits.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
    console.error('DISCORD_TOKEN and CLIENT_ID are required.');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('about')
        .setDescription('About AURA Rooms'),

    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Auto-setup AURA Rooms (creates category, log, lobby)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('export')
        .setDescription('Export AURA Rooms configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('import')
        .setDescription('Import AURA Rooms configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addAttachmentOption((option) =>
            option.setName('file').setDescription('Config JSON file. If omitted, a modal opens.'),
        ),

    new SlashCommandBuilder()
        .setName('room')
        .setDescription('Manage your temp voice room')
        .addSubcommand((sub) => sub.setName('panel').setDescription('Open your room control panel'))
        .addSubcommand((sub) =>
            sub.setName('activity').setDescription('Set room activity and auto-name state')
                .addStringOption((o) => o.setName('tag').setDescription('Activity tag').setMaxLength(SafeLimits.MAX_ACTIVITY_TAG_LEN))
                .addBooleanOption((o) => o.setName('autoname').setDescription('Auto name enabled')),
        ),

    new SlashCommandBuilder()
        .setName('template')
        .setDescription('Manage personal room templates')
        .addSubcommand((sub) =>
            sub.setName('save').setDescription('Save a template')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32))
                .addStringOption((o) => o.setName('nametemplate').setDescription('Room name template').setRequired(true).setMaxLength(100))
                .addStringOption((o) => o.setName('privacy').setDescription('Privacy mode').setRequired(true)
                    .addChoices({ name: 'public', value: 'public' }, { name: 'locked', value: 'locked' }, { name: 'private', value: 'private' }))
                .addIntegerOption((o) => o.setName('userlimit').setDescription('User limit').setRequired(true).setMinValue(0).setMaxValue(99))
                .addStringOption((o) => o.setName('activity').setDescription('Activity tag').setMaxLength(100))
                .addBooleanOption((o) => o.setName('autoname').setDescription('Auto name enabled')),
        )
        .addSubcommand((sub) =>
            sub.setName('edit').setDescription('Edit an existing template')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32))
                .addStringOption((o) => o.setName('nametemplate').setDescription('Room name template').setMaxLength(100))
                .addStringOption((o) => o.setName('privacy').setDescription('Privacy mode')
                    .addChoices({ name: 'public', value: 'public' }, { name: 'locked', value: 'locked' }, { name: 'private', value: 'private' }))
                .addIntegerOption((o) => o.setName('userlimit').setDescription('User limit').setMinValue(0).setMaxValue(99))
                .addStringOption((o) => o.setName('activity').setDescription('Activity tag').setMaxLength(100))
                .addBooleanOption((o) => o.setName('autoname').setDescription('Auto name enabled')),
        )
        .addSubcommand((sub) =>
            sub.setName('delete').setDescription('Delete a template')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32)),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('List saved templates'))
        .addSubcommand((sub) =>
            sub.setName('apply').setDescription('Apply a template to your current temp room')
                .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true).setMaxLength(32)),
        ),

    new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug diagnostics (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) => sub.setName('voice').setDescription('Show voice flow diagnostics')),
];

const rest = new REST({ version: '10' }).setToken(token);

async function deploy() {
    const json = commands.map((cmd) => cmd.toJSON());

    if (guildId) {
        console.log(`Deploying ${json.length} commands to guild ${guildId}...`);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: json });
        console.log('Guild commands deployed.');
    } else {
        console.log(`Deploying ${json.length} commands globally...`);
        await rest.put(Routes.applicationCommands(clientId), { body: json });
        console.log('Global commands deployed.');
    }
}

deploy().catch((error) => {
    console.error('Deploy failed:', error);
    process.exit(1);
});
