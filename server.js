// server.js — production (mention → n8n → reply)
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

// HTTP endpoints (Render/UptimeRobot)
const app = express();
app.get('/',  (_, res) => res.status(200).send('ok'));
app.get('/health',  (_, res) => res.status(200).json({ ok: true }));
app.get('/healthz', (_, res) => res.status(200).json({ ok: true }));
app.listen(PORT, () => console.log(`HTTP listening on ${PORT}`));

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  try {
    // Alleen guilds, geen bots
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    // Alleen reageren als onze bot echt getagd is
    if (!message.mentions.users.has(client.user.id)) return;

    // Vraag = content zonder de @mention
    const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
    const vraag = message.content.replace(mentionRegex, '').trim();
    if (!vraag) {
      await message.reply({
        content: '👋 Zet je vraag achter de mention, bv. “@Bot hoe werkt X?”',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    await message.channel.sendTyping();

    // Stuur naar n8n (Production Webhook URL)
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

    // Verwacht { "message": "..." } terug
    const data = resp.ok ? await resp.json().catch(() => ({})) : {};
    const reply = data?.message || 'Ik kon geen passend antwoord vinden.';

    await message.reply({ content: reply, allowedMentions: { repliedUser: false } });
  } catch {
    try { await message.react('⚠️'); } catch {}
  }
});

client.login(BOT_TOKEN);
