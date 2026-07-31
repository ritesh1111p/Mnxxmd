import axios from "axios";
import yts from "yt-search";
import { Module } from "../lib/plugins.js";

Module({
  command: "play",
  package: "youtube",
  description: "Play song from YouTube",
})(async (message, match) => {
  try {
    // ❌ No Query
    if (!match) {
      return message.send(
        "*Eɴᴛᴇʀ Sᴏɴɢ Nᴀᴍᴇ*\n\n`*.play Tum Hi Ho*`"
      );
    }

    await message.react("🔍");

    // 🔎 Search YouTube
    const search = await yts(match);

    if (!search.videos || search.videos.length === 0) {
      return message.send("❌ Song not found");
    }

    const video = search.videos[0];

    // 📝 Search Message
    const caption = `
🔍 _*🌷🎧ꜱᴇᴀʀᴄʜɪɴɢ ʙʏ ᴍᴏᴏɴ x xᴅ :*_

_*${
  video.title.length > 60
    ? video.title.slice(0, 60) + "..."
    : video.title
}*_
`.trim();

    await message.send({
      text: caption,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363423513489896@newsletter",
          newsletterName: "𝚳𝚯𝚯𝚴-𝚾 𝚾𝐃",
          serverMessageId: 6,
        },
      },
    });

    // 🌐 API CALL
    const apiUrl = `https://rabbitapi.nett.to/api/song?url=${encodeURIComponent(
      video.url
    )}`;

    const response = await axios.get(apiUrl, {
      timeout: 60000,
      headers: {
        Accept: "application/json",
      },
    });

    const data = response.data;

    // ❌ Invalid Response
    if (!data || !data.success || !data.result) {
      return message.send("❌ API response invalid");
    }

    // 🎧 Audio URL
    const audioUrl =
      data.result.audio ||
      data.result.mp3 ||
      data.result.url ||
      data.result.download;

    if (!audioUrl) {
      return message.send("❌ Audio URL not found");
    }

    // 🎵 Send Audio
    await message.send({
      audio: { url: audioUrl },
      mimetype: "audio/mpeg",
      fileName: `${data.result.title || video.title}.mp3`,
      contextInfo: {
        externalAdReply: {
          title: data.result.title || video.title,
          body: "*Powered By  𝚳𝚯𝚯𝚴-𝚾 𝚾𝐃*",
          mediaType: 2,
          thumbnailUrl: video.thumbnail,
          sourceUrl: video.url,
          renderLargerThumbnail: true,
          showAdAttribution: true,
        },
      },
    });

    await message.react("🎧");

  } catch (err) {
    console.error("[PLAY ERROR]", err);

    if (err.response) {
      console.log(err.response.data);
    }

    if (err.code === "ECONNABORTED") {
      return message.send("⏳ Server timeout, try again later");
    }

    return message.send("⚠️ Play failed");
  }
});