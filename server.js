// server.js
// Discord @mention → n8n webhook → reply terug in Discord
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

// --- Mini HTTP server (Render + UptimeRobot) ---
const app = express();
app.get('/', (_, res) => res.status(200).send('ok'));
app.get('/health', (_, res) => res.status(200).json({ ok: true }));
app.get('/healthz', (_, res) => res.status(200).json({ ok: true }));
app.listen(PORT, () => console.log(`HTTP listening on ${PORT}`));

// --- Discord client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,            // guild events
    GatewayIntentBits.GuildMessages,     // messageCreate
    GatewayIntentBits.MessageContent     // lees berichttekst (mention + tekst)
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  try {
    // Negeer bots, DM's en berichten zonder mention van onze bot
    if (message.author.bot) return;
    if (!message.inGuild?.()) return;
    if (!message.mentions.users.has(client.user.id)) return;

    // Vraag = content zonder de @mention
    const mentionRegex = new RegExp(`<@!?${client.user.id}>`);
    const vraag = message.content.replace(mentionRegex, '').trim();

    // Kleine UX: typing indicator
    await message.channel.sendTyping();

    // Log voor debug (zie Render logs)
    console.log('[MENTION]', {
      by: message.author.username,
      content: message.content
    });

    // Stuur payload naar n8n (Production Webhook URL!)
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': N8N_SECRET
      },
      body: JSON.stringify({
        vraag,
        author: { id: message.author.id, username: message.author.username },
        channel_id: message.channel.id,
        message_id: message.id,
        guild_id: message.guild.id
      })
    });

    console.log('[POST→n8n]', resp.status, N8N_WEBHOOK_URL);

    // n8n moet JSON teruggeven zoals: { "message": "..." }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`n8n HTTP ${resp.status}: ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    const reply =
      data?.message || 'Ik kon geen passend antwoord vinden.';

    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false }
    });
  } catch (err) {
    console.error('Handler error:', err);
    try { await message.react('⚠️'); } catch {}
  }
});

// Graceful shutdown (optioneel)
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
process.on('SIGINT', () => { client.destroy(); process.exit(0); });

client.login(BOT_TOKEN);
