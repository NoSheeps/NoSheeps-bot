// Discord @mention → n8n webhook → reply terug
import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const {
  PORT = 3000,
  BOT_TOKEN,
  N8N_WEBHOOK_URL,
  N8N_SECRET = 'supersecret'
} = process.env;

// --- mini HTTP server voor Render + UptimeRobot ---
const app = express();
app.get('/health', (_, res) => res.status(200).json({ ok: true }));
app.listen(PORT, () => console.log(`HTTP listening on ${PORT}`));

// --- Discord client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.inGuild()) return;                           // alleen servers
    if (!message.mentions.users.has(client.user.id)) return;  // alleen @mentions

    const mentionRegex = new RegExp(`<@!?${client.user.id}>`);
    const vraag = message.content.replace(mentionRegex, '').trim();

    await message.channel.sendTyping();

    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': N8N_SECRET },
      body: JSON.stringify({
        body: {
          vraag,
          author: { id: message.author.id, username: message.author.username },
          channel_id: message.channel.id,
          message_id: message.id,
          guild_id: message.guild.id
        }
      })
    });

    if (!resp.ok) throw new Error(`n8n HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    const reply = data?.message || 'Ik kon geen passend antwoord vinden.';

    await message.reply({ content: reply });
  } catch (err) {
    console.error('Handler error:', err);
    try { await message.react('⚠️'); } catch {}
  }
});

client.login(BOT_TOKEN);
