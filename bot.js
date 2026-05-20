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
 
const TOKEN          = process.env.BOT_TOKEN;
const GALLERY_CH     = '1505251530914267207';
const CHARACTER_CH   = '1505251475830603896';
const GALLERY_FILE   = 'images.json';
const CHARACTER_FILE = 'characters.json';
 
function loadJSON(file) {
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return []; }
}
 
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
 
function isThread(channel) {
  return channel.isThread ? channel.isThread() : false;
}
 
client.on('messageCreate', async (message) => {
  const ch = message.channel;
 
  // ── 캐릭터 채널 스레드 ──
  if (isThread(ch) && ch.parentId === CHARACTER_CH) {
    const chars    = loadJSON(CHARACTER_FILE);
    const existing = chars.findIndex(c => c.threadId === ch.id);
 
    // 이미지 수집
    const images = [];
    if (message.attachments.size > 0) {
      message.attachments.forEach(att => {
        if (att.contentType && att.contentType.startsWith('image/')) {
          images.push(att.url);
        }
      });
    }
 
    if (existing !== -1) {
      // 기존 캐릭터 업데이트 — 메시지 추가, 이미지 추가
      const char = chars[existing];
 
      // 메시지 내용 추가
      if (message.content.trim()) {
        if (!char.messages) char.messages = [];
        char.messages.push({
          content:   message.content.trim(),
          author:    message.author.username,
          timestamp: message.createdAt.toISOString(),
        });
      }
 
      // 이미지 추가
      if (images.length > 0) {
        if (!char.images) char.images = [];
        // 첫 이미지를 프로필로
        if (!char.imageUrl) char.imageUrl = images[0];
        char.images = char.images.concat(images);
      }
 
      char.updatedAt = new Date().toISOString();
      chars[existing] = char;
 
    } else {
      // 새 캐릭터 생성
      const newChar = {
        name:       ch.name,  // 스레드 제목 = 캐릭터 이름
        threadId:   ch.id,
        threadName: ch.name,
        discordId:  message.author.id,
        discordTag: message.author.username,
        imageUrl:   images.length > 0 ? images[0] : '',
        images:     images,
        messages:   message.content.trim() ? [{
          content:   message.content.trim(),
          author:    message.author.username,
          timestamp: message.createdAt.toISOString(),
        }] : [],
        createdAt:  new Date().toISOString(),
        updatedAt:  new Date().toISOString(),
      };
      chars.unshift(newChar);
    }
 
    saveJSON(CHARACTER_FILE, chars);
    console.log('캐릭터 업데이트:', ch.name, '이미지:', images.length + '장');
    message.react('✅').catch(() => {});
    return;
  }
 
  // ── 갤러리 채널 ──
  const isGalleryDirect = ch.id === GALLERY_CH;
  const isGalleryThread = isThread(ch) && ch.parentId === GALLERY_CH;
 
  if (isGalleryDirect || isGalleryThread) {
    if (message.attachments.size === 0) return;
    const images  = loadJSON(GALLERY_FILE);
    let isFirst   = true;
 
    message.attachments.forEach((attachment) => {
      if (!attachment.contentType) return;
      if (!attachment.contentType.startsWith('image/')) return;
      images.unshift({
        url:       attachment.url,
        proxyUrl:  attachment.proxyURL,
        filename:  attachment.name,
        messageId: message.id,
        channelId: ch.id,
        isThread:  isThread(ch),
        isFirst,
        timestamp: message.createdAt.toISOString(),
        author:    message.author.username,
      });
      isFirst = false;
    });
 
    if (images.length > 50) images.splice(50);
    saveJSON(GALLERY_FILE, images);
    console.log('갤러리 저장:', images.length + '장');
  }
});
 
// 스레드 삭제 시 캐릭터 제거
client.on('threadDelete', (thread) => {
  if (thread.parentId !== CHARACTER_CH) return;
  const chars    = loadJSON(CHARACTER_FILE);
  const filtered = chars.filter(c => c.threadId !== thread.id);
  if (filtered.length !== chars.length) {
    saveJSON(CHARACTER_FILE, filtered);
    console.log('캐릭터 삭제:', thread.name);
  }
});
 
// 갤러리 이미지 삭제
client.on('messageDelete', (message) => {
  const ch = message.channel;
  if (ch.id !== GALLERY_CH && !(isThread(ch) && ch.parentId === GALLERY_CH)) return;
  const images   = loadJSON(GALLERY_FILE);
  const filtered = images.filter(img => img.messageId !== message.id);
  if (filtered.length !== images.length) saveJSON(GALLERY_FILE, filtered);
});
 
client.on('messageDeleteBulk', (messages) => {
  const ids      = messages.map(m => m.id);
  const images   = loadJSON(GALLERY_FILE);
  const filtered = images.filter(img => !ids.includes(img.messageId));
  if (filtered.length !== images.length) saveJSON(GALLERY_FILE, filtered);
});
 
client.once('ready', () => {
  console.log('AoyamaBot 온라인:', client.user.tag);
});
 
client.login(TOKEN);
 
app.use(cors());
app.use(express.json());
 
app.get('/images', (req, res) => { res.json(loadJSON(GALLERY_FILE)); });
 
app.get('/images/first', (req, res) => {
  const all  = loadJSON(GALLERY_FILE);
  const seen = {};
  res.json(all.filter(img => {
    if (seen[img.messageId]) return false;
    seen[img.messageId] = true;
    return true;
  }));
});
 
app.get('/characters', (req, res) => { res.json(loadJSON(CHARACTER_FILE)); });
 
setInterval(() => {
  https.get('https://aoyama-bot.onrender.com/images', res => {
    console.log('슬립 방지 핑:', res.statusCode);
  }).on('error', e => console.log('핑 실패:', e.message));
}, 5 * 60 * 1000);
 
app.listen(3000, () => { console.log('API 서버 실행 중: port 3000'); });
