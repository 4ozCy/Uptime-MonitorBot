require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, ActivityType} = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
const port = 8080;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember],
});

mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  warnings: { type: Number, default: 0 },
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

const User = mongoose.model('User', userSchema);

const commands = [
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user in the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mute')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the mute')
        .setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user in the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to unmute')
        .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check a user\'s warning count')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check')
        .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear a number of messages from the current channel')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to clear')
        .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily restrict a user\'s ability to send messages')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to timeout')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage user roles')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a role to a user')
        .addUserOption(option => option.setName('user').setDescription('User to add role to').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Role to add').setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from a user')
        .addUserOption(option => option.setName('user').setDescription('User to remove role from').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true)))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Fetch information about a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to get info about')
        .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Fetch information about the server')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('change-status')
    .setDescription('Change the bot status (Dev only)')
    .addStringOption(option =>
      option.setName('activity')
        .setDescription('The activity text')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('The type of activity (PLAYING, WATCHING, LISTENING)')
        .setRequired(true)
        .addChoices(
          { name: 'Playing', value: 'PLAYING' },
          { name: 'Watching', value: 'WATCHING' },
          { name: 'Listening', value: 'LISTENING' }
        ))
    .addStringOption(option =>
      option.setName('status')
        .setDescription('Bot status (online, idle, dnd, invisible)')
        .setRequired(true)
        .addChoices(
          { name: 'Online', value: 'online' },
          { name: 'Idle', value: 'idle' },
          { name: 'Do Not Disturb', value: 'dnd' },
          { name: 'Invisible', value: 'invisible' }
        ))
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options, guild, member } = interaction;

  if (commandName === 'kick') {
    const user = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';

    const targetMember = guild.members.cache.get(user.id);
    if (targetMember.kickable) {
      await targetMember.kick(reason);
      await interaction.reply({ content: `${user.tag} has been kicked for: ${reason}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `I can't kick ${user.tag}.`, ephemeral: true });
    }

  } else if (commandName === 'ban') {
    const user = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';

    const targetMember = guild.members.cache.get(user.id);
    if (targetMember.bannable) {
      await targetMember.ban({ reason });
      await interaction.reply({ content: `${user.tag} has been banned for: ${reason}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `I can't ban ${user.tag}.`, ephemeral: true });
    }

  } else if (commandName === 'mute') {
    const user = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';

    const targetMember = guild.members.cache.get(user.id);
    const muteRole = guild.roles.cache.find(role => role.name === 'Muted');
    
    if (!muteRole) {
      return interaction.reply({ content: 'No "Muted" role found in this server.', ephemeral: true });
    }

    if (targetMember.manageable) {
      await targetMember.roles.add(muteRole, reason);
      await interaction.reply({ content: `${user.tag} has been muted for: ${reason}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `I can't mute ${user.tag}.`, ephemeral: true });
    }

  } else if (commandName === 'unmute') {
    const user = options.getUser('user');
    const targetMember = guild.members.cache.get(user.id);
    const muteRole = guild.roles.cache.find(role => role.name === 'Muted');

    if (!muteRole) {
      return interaction.reply({ content: 'No "Muted" role found in this server.', ephemeral: true });
    }

    if (targetMember.manageable) {
      await targetMember.roles.remove(muteRole);
      await interaction.reply({ content: `${user.tag} has been unmuted.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `I can't unmute ${user.tag}.`, ephemeral: true });
    }

  } else if (commandName === 'warn') {
    const user = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';

    let targetUser = await User.findOne({ userId: user.id, guildId: guild.id });
    if (!targetUser) {
      targetUser = new User({ userId: user.id, guildId: guild.id, warnings: 1 });
    } else {
      targetUser.warnings += 1;
    }
    await targetUser.save();

    await interaction.reply({ content: `${user.tag} has been warned for: ${reason}. They now have ${targetUser.warnings} warning(s).`, ephemeral: true });

  } else if (commandName === 'warnings') {
    const user = options.getUser('user');
    const targetUser = await User.findOne({ userId: user.id, guildId: guild.id });

    if (!targetUser) {
      await interaction.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `${user.tag} has ${targetUser.warnings} warning(s).`, ephemeral: true });
    }

  } else if (commandName === 'clear') {
    const amount = options.getInteger('amount');

    if (amount > 100 || amount < 1) {
      return interaction.reply({ content: 'You need to input a number between 1 and 100.', ephemeral: true });
    }

    const fetchedMessages = await interaction.channel.messages.fetch({ limit: amount });
    await interaction.channel.bulkDelete(fetchedMessages, true);

    await interaction.reply({ content: `Successfully deleted ${fetchedMessages.size} messages.`, ephemeral: true });

  } else if (commandName === 'timeout') {
    const user = options.getUser('user');
    const duration = options.getInteger('duration');
    const reason = options.getString('reason') || 'No reason provided';

    const targetMember = guild.members.cache.get(user.id);
    const timeoutMilliseconds = duration * 60 * 1000;

    if (targetMember.moderatable) {
      await targetMember.timeout(timeoutMilliseconds, reason);
      await interaction.reply({ content: `${user.tag} has been timed out for ${duration} minute(s) for: ${reason}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `I can't timeout ${user.tag}.`, ephemeral: true });
    }

  } else if (commandName === 'role') {
    const subcommand = interaction.options.getSubcommand();
    const user = options.getUser('user');
    const role = options.getRole('role');
    const targetMember = guild.members.cache.get(user.id);

    if (subcommand === 'add') {
      await targetMember.roles.add(role);
      await interaction.reply({ content: `Successfully added ${role.name} to ${user.tag}.`, ephemeral: true });

    } else if (subcommand === 'remove') {
      await targetMember.roles.remove(role);
      await interaction.reply({ content: `Successfully removed ${role.name} from ${user.tag}.`, ephemeral: true });
    }

  } else if (commandName === 'user-info') {
    const user = options.getUser('user');
    const targetMember = guild.members.cache.get(user.id);

    await interaction.reply({
      embeds: [
        {
          title: `${user.tag}'s Info`,
          fields: [
            { name: 'ID', value: user.id, inline: true },
            { name: 'Username', value: user.username, inline: true },
            { name: 'Discriminator', value: `#${user.discriminator}`, inline: true },
            { name: 'Joined Server', value: targetMember.joinedAt.toDateString(), inline: true },
            { name: 'Roles', value: targetMember.roles.cache.map(role => role.name).join(', ') || 'None', inline: true },
          ],
          thumbnail: { url: user.displayAvatarURL({ dynamic: true }) },
          color: 0x7289DA,
        }
      ],
      ephemeral: true
    });

  } else if (commandName === 'change-status') {
    const devId = '1107744228773220473';
    if (user.id !== devId) {
      return interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
    }

    const activity = options.getString('activity');
    const type = options.getString('type');
    const status = options.getString('status');

    try {
      client.user.setPresence({
        activities: [{ name: activity, type }],
        status,
      });
      await interaction.reply({ content: `Bot status updated to: ${type.toLowerCase()} ${activity} (${status})`, ephemeral: true });
    } catch (error) {
      console.error('Error setting bot status:', error);
      await interaction.reply({ content: 'Failed to update bot status.', ephemeral: true });
    }

  } else if (commandName === 'server-info') {
    const owner = await guild.fetchOwner();

    await interaction.reply({
      embeds: [
        {
          title: `${guild.name} Server Info`,
          fields: [
            { name: 'Server ID', value: guild.id, inline: true },
            { name: 'Owner', value: owner.user.tag, inline: true },
            { name: 'Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
          ],
          thumbnail: { url: guild.iconURL({ dynamic: true }) },
          color: 0x7289DA,
        }
      ],
      ephemeral: true
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

client.login(process.env.TOKEN);
