const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType} = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const express = require('express');
const app = express();
const multer = require('multer');
const clamav = require('clamav.js');
const fs = require('fs');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel]
});

const upload = multer({ dest: 'uploads/' });

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
        .setName('scan-file')
        .setDescription('Scan an uploaded file for viruses')
        .addAttachmentOption(option =>
            option.setName('file')
        .setDescription('The file to scan')
        .setRequired(true)),
]
    .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
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

async function scanFile(filePath) {
    return new Promise((resolve, reject) => {
        const port = 3310;
        const host = 'localhost';

        clamav.createScanner(port, host).scan(filePath, (err, object, malicious) => {
            if (err) {
                reject(err);
            } else {
                resolve(malicious);
            }
        });
    });
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity({
        name: 'Your Monitor Heart Beat',
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
        
   } else if (commandName === 'scan-file') 
{
        const attachment = interaction.options.getAttachment('file');

        const filePath = `uploads/${attachment.name}`;
        const fileStream = fs.createWriteStream(filePath);

        const response = await axios.get(attachment.url, { responseType: 'stream' });
        response.data.pipe(fileStream);

        fileStream.on('finish', async () => {
            try {
                const isMalicious = await scanFile(filePath);

                const embed = new EmbedBuilder()
                    .setTitle('File Scan Result')
                    .setDescription(isMalicious ? '⚠️ Malicious file detected!' : '✅ File is clean.')
                    .addFields({ name: 'File', value: attachment.name })
                    .setColor(isMalicious ? 0xff0000 : 0x00ff00);

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error(error);
                await interaction.reply('An error occurred during the scan.');
            } finally {
                fs.unlinkSync(filePath);
            }
        });
    }
});
    
app.get('/', (req, res) => {
  res.send('the bot is online');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

client.login(process.env.TOKEN);