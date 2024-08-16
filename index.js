const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const express = require('express');
const app = express();

const client = new Client({ 
      intents: [
            GatewayIntentBits.Guilds, 
            GatewayIntentBits.GuildMessages, 
            GatewayIntentBits.GuildVoiceStates
      ],
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

const commands = [
      new SlashCommandBuilder()
            .setName('add-site')
            .setDescription('Add a new site to monitor')
            .addStringOption(option =>
                  option.setName('url')
                        .setDescription('The URL of the site to monitor')
                        .setRequired(true)
            ).toJSON(),
      new SlashCommandBuilder()
            .setName('delete-site')
            .setDescription('Delete a site from monitoring')
            .addStringOption(option =>
                  option.setName('url')
                        .setDescription('The URL of the site to remove')
                        .setRequired(true)
            ).toJSON(),
      new SlashCommandBuilder()
            .setName('status')
            .setDescription('Check the status of all monitored sites')
            .toJSON(),
      new SlashCommandBuilder()
            .setName('site-list')
            .setDescription('Get a list of all monitored sites')
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
      }
});

client.on('voiceStateUpdate', (oldState, newState) => {
      if (newState.member.id === client.user.id) return;
      if (newState.channelId && newState.member.id === '1107744228773220473') {
            const channel = newState.guild.channels.cache.get(newState.channelId);
            if (channel && channel.isVoice()) {
                  joinVoiceChannel({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator,
                  });
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
