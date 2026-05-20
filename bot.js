
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
const GALLERY_CH     = '1505251530914267207';  // 갤러리 채널
const CHARACTER_CH   = '1505251475830603896';  // 캐릭터 등록 채널 (스레드 부모)
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
 
// 스레드 메시지 카운터 (메모리)
var threadMsgCount = {};
 
client.on('messageCreate', async (message) => {
  const ch = message.channel;
 
  // ── 캐릭터 채널 스레드 감지 ──
  if (isThread(ch) && ch.parentId === CHARACTER_CH) {
    if (!threadMsgCount[ch.id]) threadMsgCount[ch.id] = 0;
    threadMsgCount[ch.id]++;
    const msgNum = threadMsgCount[ch.id];
 
    console.log(`[캐릭터 스레드 ${ch.name}] 메시지 #${msgNum}`);
 
    // 첫 번째 메시지 — 사진 + 캐릭터 정보
    if (msgNum === 1) {
      const content = message.content.trim();
      const lines   = content.split('\n').map(l => l.trim());
 
      const get = (key) => {
        const line = lines.find(l => l.startsWith(key + ':'));
        return line ? line.replace(key + ':', '').trim() : '';
      };
 
      const name = get('이름') || ch.name; // 이름 없으면 스레드 제목 사용
      const rank = get('계급');
      const age  = get('나이');
      const bio  = get('배경');
 
      // 첫 번째 이미지 사용
      let imageUrl = '';
      if (message.attachments.size > 0) {
        const att = message.attachments.find(a => a.contentType && a.contentType.startsWith('image/'));
        if (att) imageUrl = att.url;
      }
 
      const chars    = loadJSON(CHARACTER_FILE);
      const existing = chars.findIndex(c => c.threadId === ch.id);
      const charData = {
        name,
        rank,
        age,
        bio,
        imageUrl,
        threadId:   ch.id,
        threadName: ch.name,
        discordId:  message.author.id,
        discordTag: message.author.username,
        updatedAt:  new Date().toISOString(),
      };
 
      if (existing !== -1) {
        chars[existing] = charData;
      } else {
        chars.unshift(charData);
      }
 
      saveJSON(CHARACTER_FILE, chars);
      console.log('캐릭터 등록:', name);
 
      message.react('✅').catch(() => {});
      return;
    }
  }
 
  // ── 갤러리 채널 (직접 + 스레드) ──
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
    console.log('갤러리 이미지 저장:', images.length + '장');
  }
});
 
// ── 스레드 삭제 시 캐릭터 제거 ──
client.on('threadDelete', (thread) => {
  if (thread.parentId !== CHARACTER_CH) return;
  const chars    = loadJSON(CHARACTER_FILE);
  const filtered = chars.filter(c => c.threadId !== thread.id);
  if (filtered.length !== chars.length) {
    saveJSON(CHARACTER_FILE, filtered);
    console.log('스레드 삭제로 캐릭터 제거:', thread.name);
  }
});
 
// ── 갤러리 이미지 삭제 ──
client.on('messageDelete', (message) => {
  const ch = message.channel;
  if (ch.id !== GALLERY_CH && !(isThread(ch) && ch.parentId === GALLERY_CH)) return;
  const images   = loadJSON(GALLERY_FILE);
  const filtered = images.filter(img => img.messageId !== message.id);
  if (filtered.length !== images.length) {
    saveJSON(GALLERY_FILE, filtered);
    console.log('갤러리 이미지 삭제, 남은:', filtered.length + '장');
  }
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
 
// ── Express API ──
app.use(cors());
app.use(express.json());
 
app.get('/images', (req, res) => {
  res.json(loadJSON(GALLERY_FILE));
});
 
app.get('/images/first', (req, res) => {
  const all  = loadJSON(GALLERY_FILE);
  const seen = {};
  res.json(all.filter(img => {
    if (seen[img.messageId]) return false;
    seen[img.messageId] = true;
    return true;
  }));
});
 
app.get('/characters', (req, res) => {
  res.json(loadJSON(CHARACTER_FILE));
});
 
// 슬립 방지 핑
setInterval(() => {
  https.get('https://aoyama-bot.onrender.com/images', res => {
    console.log('슬립 방지 핑:', res.statusCode);
  }).on('error', e => console.log('핑 실패:', e.message));
}, 5 * 60 * 1000);
 
app.listen(3000, () => {
  console.log('API 서버 실행 중: port 3000');
});
