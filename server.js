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

// ---- Mini HTTP server (Render + UptimeRobot) ----
const app = express();
app.get('/', (_, res) => res.status(200).send('ok'));
app.get('/health', (_, res) => res.status(200).json({ ok: true }));
app.get('/healthz', (_, res) => res.status(200).json({ ok: true }));
app.listen(PORT, () => console.log(`HTTP listening on ${PORT}`));

// ---- Discord client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Voeg Message-partials toe (soms handig bij uncached events)
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  try {
    // Negeer bots/DMs/berichten zonder @mention naar deze bot
    if (message.author.bot) return;
    if (!message.inGuild?.()) return;
    if (!message.mentions.users.has(client.user.id)) return;

    // Vraag = content zonder de @mention (ook als de mention vooraan staat)
    const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
    const vraag = message.content.replace(mentionRegex, '').trim();

    // Als iemand alleen de bot tagt zonder vraag, skip of stuur korte hint
    if (!vraag) {
      await message.reply({
        content: '👋 Stel je vraag na de mention, bijv. “@Bot hoe werkt X?”',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // UX: typing indicator + logging
    await message.channel.sendTyping();
    console.log('[MENTION]', { by: message.author.username, content: message.content });

    // POST naar n8n (Production Webhook URL!)
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': N8N_SECRET,
      },
      body: JSON.stringify({
        vraag,
        author: { id: message.author.id, username: message.author.username },
        channel_id: message.channel.id,
        message_id: message.id,
        guild_id: message.guild.id,
      }),
    });

    console.log('[POST→n8n]', resp.status, N8N_WEBHOOK_URL);

    // n8n antwoord verwacht: { "message": "..." }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`n8n HTTP ${resp.status}: ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    const reply = data?.message || 'Ik kon geen passend antwoord vinden.';

    await message.reply({ content: reply, allowedMentions: { repliedUser: false } });
  } catch (err) {
    console.error('Handler error:', err);
    try { await message.react('⚠️'); } catch {}
  }
});

// Graceful shutdown
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
process.on('SIGINT', () => { client.destroy(); process.exit(0); });

client.login(BOT_TOKEN);
