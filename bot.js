const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const https   = require('https');
 
const app    = express();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});
 
const TOKEN      = process.env.BOT_TOKEN;
const CHANNEL_ID = '1505251530914267207';
const DATA_FILE  = 'images.json';
 
function loadImages() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return []; }
}
 
function saveImages(images) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(images, null, 2));
}
 
client.on('messageCreate', (message) => {
  if (message.channel.id !== CHANNEL_ID) return;
  if (message.attachments.size === 0) return;
 
  var images  = loadImages();
  var isFirst = true;
 
  message.attachments.forEach((attachment) => {
    if (!attachment.contentType) return;
    if (!attachment.contentType.startsWith('image/')) return;
 
    images.unshift({
      url:       attachment.url,
      proxyUrl:  attachment.proxyURL,
      filename:  attachment.name,
      messageId: message.id,
      isFirst:   isFirst,
      timestamp: message.createdAt.toISOString(),
      author:    message.author.username,
    });
 
    isFirst = false;
  });
 
  if (images.length > 50) images = images.slice(0, 50);
  saveImages(images);
  console.log('이미지 저장됨:', images.length + '장');
});
 
client.once('ready', () => {
  console.log('AoyamaBot 온라인:', client.user.tag);
});
 
client.login(TOKEN);
 
// Express API
app.use(cors());
app.use(express.json());
 
app.get('/images', (req, res) => {
  res.json(loadImages());
});
 
app.get('/images/first', (req, res) => {
  var all     = loadImages();
  var seen    = {};
  var filtered = all.filter(function(img) {
    if (seen[img.messageId]) return false;
    seen[img.messageId] = true;
    return true;
  });
  res.json(filtered);
});
 
// 5분마다 핑 — Render 슬립 방지
setInterval(function() {
  https.get('https://aoyama-bot.onrender.com/images', function(res) {
    console.log('슬립 방지 핑 성공:', res.statusCode);
  }).on('error', function(e) {
    console.log('핑 실패:', e.message);
  });
}, 5 * 60 * 1000);
 
app.listen(3000, () => {
  console.log('API 서버 실행 중: port 3000');
});
