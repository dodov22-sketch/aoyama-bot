const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');

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

// 이미지 데이터 로드
function loadImages() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return []; }
}

// 이미지 데이터 저장
function saveImages(images) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(images, null, 2));
}

// 디스코드 봇 — 지정 채널 이미지 감지
client.on('messageCreate', (message) => {
  if (message.channel.id !== CHANNEL_ID) return;
  if (message.attachments.size === 0) return;

  var images = loadImages();

  message.attachments.forEach((attachment) => {
    if (!attachment.contentType) return;
    if (!attachment.contentType.startsWith('image/')) return;

    images.unshift({
      url:       attachment.url,
      proxyUrl:  attachment.proxyURL,
      filename:  attachment.name,
      timestamp: message.createdAt.toISOString(),
      author:    message.author.username,
    });
  });

  // 최대 50장 유지
  if (images.length > 50) images = images.slice(0, 50);
  saveImages(images);
  console.log('이미지 저장됨:', images.length + '장');
});

client.once('ready', () => {
  console.log('AoyamaBot 온라인:', client.user.tag);
});

client.login(TOKEN);

// Express API 서버
app.use(cors());
app.use(express.json());

// 이미지 목록 반환
app.get('/images', (req, res) => {
  res.json(loadImages());
});

app.listen(3000, () => {
  console.log('API 서버 실행 중: port 3000');
});
