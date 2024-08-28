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
    uptime: { type: Number, default: 0 },
    downtime: { type: Number, default: 0 }
});

const Site = mongoose.model('Site', siteSchema);

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
        .setName('uptime')
        .setDescription('Check the uptime and downtime of a monitored site')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the site to check uptime for')
                .setRequired(true))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all available commands and their descriptions')
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


async function checkSiteStatus(site) {
    try {
        const start = Date.now();
        const response = await axios.get(site.url);
        const ping = Date.now() - start;
        const newStatus = response.status === 200 ? 'UP' : 'DOWN';

        if (site.status !== newStatus) {
            const now = new Date();
            const duration = now - site.lastChecked;

            if (site.status === 'UP') {
                site.uptime += duration;
            } else if (site.status === 'DOWN') {
                site.downtime += duration;
            }

            site.status = newStatus;
            site.ping = ping;
            site.lastChecked = now;
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
        const now = new Date();
        const duration = now - site.lastChecked;

        if (site.status !== newStatus) {
            site.downtime += duration;

            site.status = newStatus;
            site.ping = null;
            site.lastChecked = now;
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
        const site = await Site.findOne({ url: url });

        if (site) {
            await site.remove();  // This will delete the site from the database
            const embed = new EmbedBuilder()
                .setTitle('Site Removed')
                .setDescription(`Stopped monitoring and deleted **${url}** from the list`)
                .setColor(0xFF0000)
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: `No site found with the URL **${url}**.`, ephemeral: true });
        }
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
    } else if (commandName === 'uptime') {
        const url = interaction.options.getString('url');
        const site = await Site.findOne({ url: url });

        if (site) {
            const totalTime = site.uptime + site.downtime;
            const uptimePercentage = ((site.uptime / totalTime) * 100).toFixed(2);
            const downtimePercentage = ((site.downtime / totalTime) * 100).toFixed(2);

            const embed = new EmbedBuilder()
                .setTitle(`Uptime for ${site.url}`)
                .setDescription(`**Uptime:** ${uptimePercentage}%\n**Downtime:** ${downtimePercentage}%`)
                .setColor(0x00ff00)
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: `No site found with the URL **${url}**.`, ephemeral: true });
       }
    } else if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('Help - List of Commands')
            .setDescription(
                `**/add-site <url>** - Add a new site to monitor.\n` +
                `**/delete-site <url>** - Delete a site from monitoring.\n` +
                `**/status** - Check the status of all monitored sites.\n` +
                `**/site-list** - Get a list of all monitored sites.\n` +
                `**/uptime <url>** - Check the uptime and downtime of a monitored site.\n` +
                `**/anon-msg <user> <message>** - Send an anonymous message to a user.\n` +
                `**/help** - Display this help message.`
            )
            .setColor(0x00ff00)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
});

app.get('/', (req, res) => {
      res.send('the bot is online');
});

app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
});

client.login(process.env.TOKEN);
