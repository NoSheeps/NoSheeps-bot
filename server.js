// server.js
import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';

const {
  PORT = 3000,
  BOT_TOKEN,
  CHANNEL_ID,                 // 1390279105928232991
  N8N_WEBHOOK_URL,
  N8N_SECRET = 'supersecret'
} = process.env;

if (!BOT_TOKEN) throw new Error('Missing BOT_TOKEN');
if (!CHANNEL_ID) throw new Error('Missing CHANNEL_ID');

// Health endpoints voor Render
const app = express();
app.get('/', (_, res) => res.status(200).send('ok'));
app.get('/health', (_, res) => res.status(200).json({ ok: true }));
app.listen(PORT, () => console.log(`HTTP listening on ${PORT}`));

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    if (message.channelId !== CHANNEL_ID) return;

    // Alleen doorgaan als de bot is getagd
    if (!message.mentions.users.has(client.user.id)) return;

    // Eén payload met het originele bericht + metadata
    const payload = {
      message: message.content,
      author: {
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator
      },
      channel_id: message.channel.id,
      message_id: message.id,
      guild_id: message.guild.id,
      attachments: [...message.attachments.values()].map(a => ({
        url: a.url,
        name: a.name,
        contentType: a.contentType,
      })),
      timestamp: message.createdAt
    };

    console.log(`📥 Mention in #ai-coach door ${message.author.username}: ${message.content}`);

    if (!N8N_WEBHOOK_URL) {
      console.warn('⚠ N8N_WEBHOOK_URL ontbreekt, skip forwarding');
      return;
    }

    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': N8N_SECRET
      },
      body: JSON.stringify(payload)
    });

    // Optioneel: typ-indicator of bevestiging uitzetten als n8n zelf antwoordt
    // await message.channel.sendTyping();

  } catch (err) {
    console.error('Handler error:', err);
    try { await message.react('⚠️'); } catch {}
  }
});

client.login(BOT_TOKEN);
