const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType, Collection} = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const express = require('express');
const app = express();
const { Player } = require('discord-player');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages.GuildVoicStates],
    partials: [Partials.Channel]
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

const Site = mongoose.model('Site', siteSchema);

const player = new Player(client);
client.commands = new Collection();

const commands = [
    new SlashCommandBuilder()
        .setName('add-site')
        .setDescription('Add a new site to monitor')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the site to monitor')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('delete-site')
        .setDescription('Delete a site from monitoring')
        .addStringOption(option =>
            option.setName('url')
        .setDescription('The URL of the site to remove')
        .setRequired(true)),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check the status of all monitored sites'),
    new SlashCommandBuilder()
        .setName('site-list')
        .setDescription('Get a list of all monitored sites'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube')
        .addStringOption(option =>
            option.setName('song')
                .setDescription('The song to play')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing song'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and clear the queue'),
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Adjust the playback volume')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume level (1-100)')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('speed')
        .setDescription('Adjust the playback speed')
        .addNumberOption(option =>
            option.setName('rate')
                .setDescription('Speed rate (0.5 - 2.0)')
                .setRequired(true)),
].map(command => command.toJSON());

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
    } else if (commandName === 'site-list') 
{
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
   } else if (commandName === 'play') {
        const song = interaction.options.getString('song');
        const queue = player.createQueue(interaction.guild);
        await queue.join(interaction.member.voice.channel);
        const track = await player.search(song, {
            requestedBy: interaction.user
        }).then(x => x.tracks[0]);
        queue.play(track);
        await interaction.reply({ content: `Playing **${track.title}**`, ephemeral: true });
    } else if (commandName === 'skip') {
        const queue = player.getQueue(interaction.guild);
        queue.skip();
        await interaction.reply({ content: 'Skipped the current song.', ephemeral: true });
    } else if (commandName === 'stop') {
        const queue = player.getQueue(interaction.guild);
        queue.destroy();
        await interaction.reply({ content: 'Stopped the music and cleared the queue.', ephemeral: true });
    } else if (commandName === 'volume') {
        const level = interaction.options.getInteger('level');
        const queue = player.getQueue(interaction.guild);
        queue.setVolume(level);
        await interaction.reply({ content: `Volume set to **${level}%**`, ephemeral: true });
    } else if (commandName === 'speed') {
        const rate = interaction.options.getNumber('rate');
        const queue = player.getQueue(interaction.guild);
        queue.filters.setFilter('speed', { speed: rate });
        await interaction.reply({ content: `Playback speed set to **${rate}x**`, ephemeral: true });
    }
});
    
app.get('/', (req, res) => {
  res.send('the bot is online');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

client.login(process.env.TOKEN);