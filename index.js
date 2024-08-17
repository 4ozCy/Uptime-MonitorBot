const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType, ChannelType, AttachmentBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const express = require('express');
const app = express();

const client = new Client({ 
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember],
});

mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
});

const siteSchema = new mongoose.Schema({
      url: String,
      status: String,
      lastChecked: Date,
      ping: Number,
});

const userSchema = new mongoose.Schema({
    userId: String,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
});

const Site = mongoose.model('Site', siteSchema);
const User = mongoose.model('User', userSchema);

const commands = [
      new SlashCommandBuilder()
            .setName('add-site')
            .setDescription('Add a new site to monitor')
            .addStringOption(option =>
                  option.setName('url')
                        .setDescription('The URL of the site to monitor')
                        .setRequired(true))
            .toJSON(),
      new SlashCommandBuilder()
            .setName('delete-site')
            .setDescription('Delete a site from monitoring')
            .addStringOption(option =>
                  option.setName('url')
                        .setDescription('The URL of the site to remove')
                        .setRequired(true))
            .toJSON(),
      new SlashCommandBuilder()
            .setName('status')
            .setDescription('Check the status of all monitored sites')
            .toJSON(),
      new SlashCommandBuilder()
            .setName('site-list')
            .setDescription('Get a list of all monitored sites')
            .toJSON(),
      new SlashCommandBuilder()
        .setName('anon-msg')
        .setDescription('Send an anonymous message or file to a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to send the message to')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The anonymous message')
                .setRequired(true))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('level')
        .setDescription('Check your current level and XP')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the top users by level and XP')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('add-level')
        .setDescription('Manually add levels to a user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to add a level to')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('levels')
                .setDescription('The number of levels to add')
                .setRequired(true))
        .toJSON()
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

client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.id === '1107744228773220473') {
        const voiceChannel = newState.channel;
        const connection = getVoiceConnection(newState.guild.id);

        if (voiceChannel && (voiceChannel.type === ChannelType.GuildVoice || voiceChannel.type === ChannelType.GuildStageVoice) && !connection) {
            try {
                joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: voiceChannel.guild.id,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                });
                console.log(`Joined ${voiceChannel.name}`);
            } catch (error) {
                console.error(`Could not join ${voiceChannel.name}:`, error);
            }
        } else if (!voiceChannel && connection) {
            try {
                connection.destroy();
                console.log(`Left the voice channel`);
            } catch (error) {
                console.error(`Could not leave the voice channel:`, error);
            }
        }
    }
});

async function checkSiteStatus(site) {
      try {
            const start = Date.now();
            const response = await axios.get(site.url);
            const ping = Date.now() - start;
            const newStatus = response.status === 200 ? 'UP' : 'DOWN';

            if (site.status !== newStatus) {
                  site.status = newStatus;
                  site.ping = ping;
                  site.lastChecked = new Date();
                  await site.save();

                  const channel = client.channels.cache.get(process.env.CHANNEL_ID);
                  if (channel) {
                        const embed = new EmbedBuilder()
                              .setTitle(`${site.url} Status Update`)
                              .setDescription(`**Status**: ${newStatus}\n**Ping**: ${ping}ms`)
                              .setColor(newStatus === 'UP' ? 0x00ff00 : 0xff0000)
                              .setTimestamp();
                        channel.send({ embeds: [embed] });
                  }
            }
      } catch (error) {
            const newStatus = 'DOWN';

            if (site.status !== newStatus) {
                  site.status = newStatus;
                  site.ping = null;
                  site.lastChecked = new Date();
                  await site.save();

                  const channel = client.channels.cache.get(process.env.CHANNEL_ID);
                  if (channel) {
                        const embed = new EmbedBuilder()
                              .setTitle(`${site.url} Status Update`)
                              .setDescription(`**Status**: ${newStatus}`)
                              .setColor(0xff0000)
                              .setTimestamp();
                        channel.send({ embeds: [embed] });
                  }
            }
      }
}

async function monitorSites() {
      const sites = await Site.find();
      sites.forEach(site => {
            checkSiteStatus(site);
      });
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const user = await User.findOne({ userId: message.author.id });
    const xpGain = Math.floor(Math.random() * 10) + 1;

    if (!user) {
        const newUser = new User({
            userId: message.author.id,
            username: message.author.username,
            level: 1,
            experience: xpGain,
        });
        await newUser.save();
    } else {
        user.experience += xpGain;
        const xpNeeded = user.level * 100;

        if (user.experience >= xpNeeded) {
            user.level++;
            user.experience -= xpNeeded;

            const levelUpEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setDescription(`Congratulations, ${message.author.username}! You've reached level ${user.level}.`);

            await message.channel.send({ embeds: [levelUpEmbed] });
        }

        await user.save();
    }
});

client.once('ready', async () => {
      console.log(`Logged in as ${client.user.tag}!`);
      client.user.setActivity({
            name: 'Your Heart Beat',
            type: ActivityType.Listening,
      });
      setInterval(monitorSites, 1 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;

      const { commandName } = interaction;

      if (commandName === 'add-site') {
            const url = interaction.options.getString('url');
            const newSite = new Site({ url: url, status: 'UNKNOWN', lastChecked: new Date(), ping: null });
            await newSite.save();
            const embed = new EmbedBuilder()
                  .setTitle('Site Added')
                  .setDescription(`Started monitoring **${url}**`)
                  .setColor(0x00FF00)
                  .setTimestamp();
            await interaction.reply({ embeds: [embed] });
      } else if (commandName === 'delete-site') {
            const url = interaction.options.getString('url');
            await Site.deleteOne({ url: url });
            const embed = new EmbedBuilder()
                  .setTitle('Site Removed')
                  .setDescription(`Stopped monitoring **${url}**`)
                  .setColor(0xFF0000)
                  .setTimestamp();
            await interaction.reply({ embeds: [embed] });
      } else if (commandName === 'status') {
            const sites = await Site.find();
            let statusMessage = '**Current Status:**\n';
            sites.forEach(site => {
                  statusMessage += `${site.url}: ${site.status} (Ping: ${site.ping !== null ? site.ping + 'ms' : 'N/A'}) (Last Checked: ${site.lastChecked.toLocaleTimeString()})\n`;
            });
            const embed = new EmbedBuilder()
                  .setTitle('Monitored Sites Status')
                  .setDescription(statusMessage)
                  .setColor(0x00ff00)
                  .setTimestamp();
            await interaction.reply({ embeds: [embed] });
      } else if (commandName === 'site-list') {
            const sites = await Site.find();
            let siteListMessage = '**Monitored Sites:**\n';
            sites.forEach(site => {
                  siteListMessage += `${site.url}\n`;
            });
            const embed = new EmbedBuilder()
                  .setTitle('Monitored Sites List')
                  .setDescription(siteListMessage)
                  .setColor(0x00ff00)
                  .setTimestamp();
            await interaction.reply({ embeds: [embed] });
      } else if (commandName === 'level') {
        const user = await User.findOne({ userId: interaction.user.id });

        if (!user) {
            await interaction.reply({
                content: 'You have no level yet. Start chatting to gain experience!',
                ephemeral: true,
            });
        } else {
            const levelEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('Level Information')
                .setDescription(`User: ${interaction.user.username}\nLevel: ${user.level}\nExperience: ${user.experience}/${user.level * 100}`);

            await interaction.reply({ embeds: [levelEmbed], ephemeral: true });
        }
     } else if (commandName === 'leaderboard') {
    const topUsers = await User.find().sort({ level: -1, experience: -1 }).limit(10);
    const leaderboardFields = [];

    const leaderboardEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('Top 10 Users')
        .setTimestamp();

    for (const [index, user] of topUsers.entries()) {
        const discordUser = await client.users.fetch(user.userId);
        const rank = index + 1;

        leaderboardFields.push({
            name: `#${rank} - ${discordUser.username}`,
            value: `**Level:** ${user.level}\n**XP:** ${user.experience}`,
            inline: false
        });

        leaderboardEmbed.addFields({
            name: '\u200b',
            value: `[Profile Picture](${discordUser.displayAvatarURL({ dynamic: true })})`,
            inline: true
        });
    }

    leaderboardEmbed.addFields(leaderboardFields);

    await interaction.reply({ embeds: [leaderboardEmbed] });
       }
    } else if (commandName === 'add-level') {
    const allowedUsers = ['1107744228773220473', ''];

    if (!allowedUsers.includes(interaction.user.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const levelsToAdd = interaction.options.getInteger('levels');

    let user = await User.findOne({ userId: targetUser.id });

    if (!user) {
        user = new User({ userId: targetUser.id, username: targetUser.username, level: 1, experience: 0 });
    }

    user.level += levelsToAdd;
    await user.save();

    const embed = new EmbedBuilder()
        .setTitle('Level Added')
        .setDescription(`Added **${levelsToAdd}** level(s) to **${targetUser.username}**. They are now at level **${user.level}**.`)
        .setColor(0x00ff00)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
      } else if (commandName === 'anon-msg') {
            const targetUser = interaction.options.getUser('user');
        const anonymousMessage = interaction.options.getString('message');
            
        try {
            if (anonymousMessage) {
                await targetUser.send(`You have received an anonymous message:\n\n${anonymousMessage}`);
            }

            await interaction.reply({ content: `Your anonymous message has been sent to ${targetUser.tag}.`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: `There was an error sending the message. Please try again.`, ephemeral: true });
          }
      }
});

app.get('/', (req, res) => {
      res.send('the bot is online');
});

app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
});

client.login(process.env.TOKEN);
