// server.js
import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';

const {
  PORT = 3000,
  BOT_TOKEN,
  CHANNEL_ID,                 // bijv. 1390279105928232991
  N8N_WEBHOOK_URL,
  N8N_SECRET = 'supersecret'
} = process.env;

// --- Sanity checks ---
if (!BOT_TOKEN) throw new Error('Missing BOT_TOKEN');
if (!CHANNEL_ID) throw new Error('Missing CHANNEL_ID');

// --- Mini webserver voor Render keep-alive & status ---
const app = express();
app.get('/', (_req, res) => {
  res
    .status(200)
    .send('<h1>NoSheeps Bot is running ✅</h1><p>Health: <a href="/health">/health</a></p>');
});
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.listen(PORT, () => console.log(`HTTP listening on ${PORT}`));

// --- Discord client ---
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

// --- Message handler ---
client.on(Events.MessageCreate, async (message) => {
  try {
    // Basisfilters
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    if (message.channelId !== CHANNEL_ID) return;

    // Alleen doorgaan als de bot is getagd
    if (!message.mentions.users.has(client.user.id)) return;

    // Payload: 1x het originele bericht + nuttige metadata
    const payload = {
      message: message.content,
      author: {
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator ?? null
      },
      channel_id: message.channel.id,
      message_id: message.id,
      guild_id: message.guild.id,
      attachments: [...message.attachments.values()].map(a => ({
        url: a.url,
        name: a.name,
        contentType: a.contentType ?? null
      })),
      timestamp: message.createdAt
    };

    console.log(`📥 Mention in #ai-coach door ${message.author.username}: ${message.content}`);

    if (!N8N_WEBHOOK_URL) {
      console.warn('⚠ N8N_WEBHOOK_URL ontbreekt, skip forwarding');
      return;
    }

    // Doorsturen naar n8n
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': N8N_SECRET
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`❌ n8n responded ${resp.status}: ${text}`);
    }
  } catch (err) {
    console.error('Handler error:', err);
    try { await message.react('⚠️'); } catch {}
  }
});

// --- Login ---
client.login(BOT_TOKEN);
