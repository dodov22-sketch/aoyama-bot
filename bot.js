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

// 스레드별 메시지 카운터 (메모리)
var threadMessageCount = {};

function loadImages() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return []; }
}

function saveImages(images) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(images, null, 2));
}

function isThread(channel) {
  return channel.isThread ? channel.isThread() : false;
}

client.on('messageCreate', (message) => {
  const ch = message.channel;

  // 일반 채널 직접 업로드 — 기존대로 저장
  if (ch.id === CHANNEL_ID) {
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
        channelId: ch.id,
        isThread:  false,
        isFirst:   isFirst,
        timestamp: message.createdAt.toISOString(),
        author:    message.author.username,
      });

      isFirst = false;
    });

    if (images.length > 50) images = images.slice(0, 50);
    saveImages(images);
    console.log('[채널] 이미지 저장됨:', images.length + '장');
    return;
  }

  // 스레드 — 부모 채널이 CHANNEL_ID인 경우만
  if (isThread(ch) && ch.parentId === CHANNEL_ID) {
    // 스레드 메시지 카운트 증가
    if (!threadMessageCount[ch.id]) threadMessageCount[ch.id] = 0;
    threadMessageCount[ch.id]++;

    const msgNum = threadMessageCount[ch.id];
    console.log(`[스레드 ${ch.id}] 메시지 #${msgNum}`);

    // 두 번째 메시지만 저장
    if (msgNum !== 2) return;
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
        channelId: ch.id,
        isThread:  true,
        isFirst:   isFirst,
        timestamp: message.createdAt.toISOString(),
        author:    message.author.username,
      });

      isFirst = false;
    });

    if (images.length > 50) images = images.slice(0, 50);
    saveImages(images);
    console.log('[스레드] 두 번째 메시지 이미지 저장됨:', images.length + '장');
    return;
  }
});

// 메시지 삭제 감지
client.on('messageDelete', (message) => {
  const ch = message.channel;
  const isTarget = ch.id === CHANNEL_ID || (isThread(ch) && ch.parentId === CHANNEL_ID);
  if (!isTarget) return;

  var images   = loadImages();
  var filtered = images.filter(function(img) {
    return img.messageId !== message.id;
  });

  if (filtered.length !== images.length) {
    saveImages(filtered);
    console.log('이미지 삭제됨, 남은 이미지:', filtered.length + '장');
  }
});

// 여러 메시지 한번에 삭제
client.on('messageDeleteBulk', (messages) => {
  var images = loadImages();
  var ids    = messages.map(function(m) { return m.id; });

  var filtered = images.filter(function(img) {
    return !ids.includes(img.messageId);
  });

  if (filtered.length !== images.length) {
    saveImages(filtered);
    console.log('다중 이미지 삭제됨, 남은 이미지:', filtered.length + '장');
  }
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
  var all      = loadImages();
  var seen     = {};
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
