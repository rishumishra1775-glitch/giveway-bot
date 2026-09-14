const { Telegraf } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const BOT_TOKEN = '8799247216:AAHWWCU8ALk39gBS4i66HwnyPWdrybxMU7I';
const MONGO_URI = 'mongodb+srv://rishumishra1775_db_user:LWj95JsVMpysfNUu@cluster0.66kema1.mongodb.net/?appName=Cluster0';
const ADMIN_ID = 7449469384;
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- MongoDB Connection ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

const GiveawaySchema = new mongoose.Schema({
  giveawayId: String,
  title: String,
  channelId: String,
  hosts: String,
  prizes: String,
  messageId: Number,
  active: { type: Boolean, default: true }
});
const Giveaway = mongoose.model('Giveaway', GiveawaySchema);

const EntrySchema = new mongoose.Schema({
  giveawayId: String,
  userId: Number,
  username: String,
  deviceHash: String
});
const Entry = mongoose.model('Entry', EntrySchema);

const userSession = {};

// --- Bot Commands ---
bot.start((ctx) => {
  ctx.reply("Welcome! Giveaway create karne ke liye /create command use karein.");
});

bot.command('create', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("Aap is command ko use nahi kar sakte!");
  }
  userSession[ctx.from.id] = { step: 'GET_CHANNEL' };
  ctx.reply("Apne Channel ka Username ya ID bhejiye (jaise @yourchannel):");
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSession[userId];

  if (!session) return;

  if (session.step === 'GET_CHANNEL') {
    session.channelId = ctx.message.text;
    session.step = 'GET_TITLE';
    return ctx.reply("Giveaway ka Name/Title kya hai?");
  } 
  else if (session.step === 'GET_TITLE') {
    session.title = ctx.message.text;
    session.step = 'GET_PRIZES';
    return ctx.reply("Giveaway me Prizes kya-kya hain?");
  } 
  else if (session.step === 'GET_PRIZES') {
    session.prizes = ctx.message.text;
    session.step = 'GET_HOSTS';
    return ctx.reply("Giveaway karne wale Hosts ke naam kya hain?");
  } 
  else if (session.step === 'GET_HOSTS') {
    session.hosts = ctx.message.text;
    
    const giveawayId = 'gw_' + Date.now();
    const hostUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const webAppUrl = `${hostUrl}/verify.html?gid=${giveawayId}`;

    const text = `🎉 **${session.title}** 🎉\n\n🎁 **Prizes:** ${session.prizes}\n👑 **Hosted By:** ${session.hosts}\n\nNeeche diye gaye button par click karke device verify karein aur participate karein!`;

    try {
      const sentMsg = await bot.telegram.sendMessage(session.channelId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Verify & Enter Giveaway", url: webAppUrl }]
          ]
        }
      });

      await Giveaway.create({
        giveawayId,
        title: session.title,
        channelId: session.channelId,
        hosts: session.hosts,
        prizes: session.prizes,
        messageId: sentMsg.message_id
      });

      delete userSession[userId];
      return ctx.reply("Giveaway successfully aapke channel par post ho gaya hai!");
    } catch (err) {
      console.error(err);
      return ctx.reply("Error: Bot ko channel par Admin banayein aur channel ID sahi check karein.");
    }
  }
});

// --- Device Verification API ---
app.post('/api/verify', async (req, res) => {
  const { giveawayId, userId, username, deviceHash } = req.body;

  if (!deviceHash || !userId || !giveawayId) {
    return res.json({ success: false, message: 'Invalid data provided.' });
  }

  const existingDevice = await Entry.findOne({ giveawayId, deviceHash });
  if (existingDevice) {
    return res.json({ success: false, message: 'Multi-account blocked! Is device se pehle hi entry ho chuki hai.' });
  }

  const existingUser = await Entry.findOne({ giveawayId, userId });
  if (existingUser) {
    return res.json({ success: false, message: 'Aap pehle hi is giveaway me enter kar chuke hain!' });
  }

  await Entry.create({ giveawayId, userId, username: username || 'User', deviceHash });
  return res.json({ success: true, message: 'Device verified successfully! Aapki entry ho gayi hai.' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  bot.launch();
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
