import axios from "axios";
import yts from "yt-search";
import { Module } from "../lib/plugins.js";

Module({
  command: "song",
  package: "youtube",
  description: "Direct Audio Song",
})(async (message, match) => {

  try {

    // ❌ No Song Name
    if (!match) {
      return message.send(
        "*Eɴᴛᴇʀ Sᴏɴɢ Nᴀᴍᴇ*\n\n`*.song Tum Hi Ho*`"
      );
    }

    // 🎧 Loading Reaction
    await message.react("🎧");

    // 🔎 Search YouTube
    const search = await yts(match);

    if (!search.videos || search.videos.length === 0) {
      return message.send("❌ Song not found");
    }

    const video = search.videos[0];

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
    });

    // ✅ Success Reaction
    await message.react("✅");

  } catch (err) {

    console.error("[SONG ERROR]", err);

    if (err.response) {
      console.log(err.response.data);
    }

    if (err.code === "ECONNABORTED") {
      return message.send("⏳ Server timeout, try again later");
    }

    return message.send("⚠️ Song download failed");
  }
});