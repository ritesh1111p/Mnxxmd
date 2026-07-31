// plugins/antihackgc.js
// Anti Hack Group Chat — blocks unauthorized admin promote/demote.
// If anyone other than the bot's own number promotes or demotes a member,
// the action is reverted AND the person who did it loses their own admin.
import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";

const DEBUG = true;
const debug = (...args) => DEBUG && console.debug("[antihackgc]", ...args);

function getBotNumber(conn) {
  const id = conn?.user?.id || conn?.user?.jid || conn?.user || null;
  if (!id) return "unknown";
  return String(id).split(":")[0].split("@")[0];
}

function enabledKeyFor(groupJid) {
  return `antihackgc:${groupJid}:enabled`;
}

function isBotAdminFromMetadata(metadata, botJidFull) {
  try {
    const list = metadata?.participants || [];
    const me = list.find(
      (p) => jidNormalizedUser(p.id || p.jid || "") === botJidFull
    );
    return !!(me && (me.admin === "admin" || me.admin === "superadmin"));
  } catch {
    return false;
  }
}

// ---------- Command handler ----------
Module({
  command: "antihackgc",
  package: "owner",
  description:
    "Enable/disable blocking of unauthorized promote/demote in this group.",
})(async (message, match) => {
  try {
    if (!(message.isFromMe || message.isfromMe)) {
      return message.send("_Only bot owner can use this command._");
    }
    if (!message.isGroup) {
      return message.send("❌ This command works only in groups.");
    }
    await message.loadGroupInfo?.();

    const botNumber = getBotNumber(message.conn);
    const groupJid = message.from;
    const raw = (match || "").trim().toLowerCase();
    const enabledKey = enabledKeyFor(groupJid);

    if (!raw) {
      const isEnabled = db.get(botNumber, enabledKey, false) === true;
      return message.send(
        `⚙️ AntiHackGC for this group\n• Status: ${
          isEnabled ? "✅ ON" : "❌ OFF"
        }\n\nUsage:\n• .antihackgc on\n• .antihackgc off\n\nWhen ON, no one except the bot owner can promote or demote anyone in this group. Anyone who tries will be reverted and lose their own admin.`
      );
    }

    if (raw === "on") {
      const already = db.get(botNumber, enabledKey, false) === true;
      if (already)
        return message.send("ℹ️ AntiHackGC is already *ON* for this group.");
      db.setHot(botNumber, enabledKey, true);
      return message.send(
        "✅ AntiHackGC has been *ENABLED*.\nNo one but the owner can promote/demote in this group now.\n\n⚠️ Make sure the bot is a *group admin*, otherwise enforcement will fail."
      );
    }

    if (raw === "off") {
      const currently = db.get(botNumber, enabledKey, false) === true;
      if (!currently)
        return message.send("ℹ️ AntiHackGC is already *OFF* for this group.");
      db.setHot(botNumber, enabledKey, false);
      return message.send("✅ AntiHackGC has been *DISABLED* for this group.");
    }

    return message.send("Usage:\n.antihackgc on\n.antihackgc off");
  } catch (err) {
    console.error("[antihackgc][command] error", err);
    return message.send("❌ An error occurred while processing the command.");
  }
});

// ---------- Enforcement handler ----------
Module({ on: "group-participants.update" })(async (_msg, event, conn) => {
  try {
    if (!event || !event.id || !event.action || !Array.isArray(event.participants))
      return;

    const action = String(event.action).toLowerCase();
    if (action !== "promote" && action !== "demote") return;

    const groupJid = event.id;
    const botNumber = getBotNumber(conn);
    const enabledKey = enabledKeyFor(groupJid);

    const enabled = (() => {
      try {
        return db.get(botNumber, enabledKey, false) === true;
      } catch (e) {
        console.error("[antihackgc] db.get failed", e);
        return false;
      }
    })();
    if (!enabled) return;

    const botJidFull = conn?.user?.id ? jidNormalizedUser(conn.user.id) : "";
    if (!botJidFull) return;

    const authorRaw = event.author || "";
    if (!authorRaw) return; // can't identify who did it, don't act
    const authorJid = jidNormalizedUser(authorRaw);

    // Bot's own actions (including our own corrections below) are always allowed.
    if (authorJid === botJidFull) return;

    const metadata = event.groupMetadata || (await conn.groupMetadata(groupJid).catch(() => null));
    if (!metadata) return;

    if (!isBotAdminFromMetadata(metadata, botJidFull)) {
      debug("bot not admin -> cannot enforce antihackgc in", groupJid);
      return;
    }

    // Never touch the actual group owner
    const groupOwnerJid = metadata.owner ? jidNormalizedUser(metadata.owner) : "";

    const targetJids = event.participants
      .map((p) => jidNormalizedUser(typeof p === "string" ? p : p.id || p.jid || ""))
      .filter(Boolean)
      .filter((j) => j !== botJidFull && j !== groupOwnerJid);

    if (action === "promote") {
      // Revert: demote whoever was just promoted
      if (targetJids.length) {
        try {
          await conn.groupParticipantsUpdate(groupJid, targetJids, "demote");
          debug("reverted unauthorized promote in", groupJid, targetJids);
        } catch (e) {
          console.error("[antihackgc] failed to revert promote:", e?.message || e);
        }
      }
    } else if (action === "demote") {
      // Revert: re-promote whoever was just demoted
      if (targetJids.length) {
        try {
          await conn.groupParticipantsUpdate(groupJid, targetJids, "promote");
          debug("reverted unauthorized demote in", groupJid, targetJids);
        } catch (e) {
          console.error("[antihackgc] failed to revert demote:", e?.message || e);
        }
      }
    }

    // Punish: strip the actor's own admin, unless they are the real group owner
    if (authorJid !== groupOwnerJid) {
      try {
        await conn.groupParticipantsUpdate(groupJid, [authorJid], "demote");
        debug("demoted unauthorized actor", authorJid, "in", groupJid);
      } catch (e) {
        console.error("[antihackgc] failed to demote actor:", e?.message || e);
      }
    }

    try {
      await conn.sendMessage(groupJid, {
        text:
          action === "promote"
            ? `🚫 *AntiHackGC*\n@${authorJid.split("@")[0]} tried to promote someone without permission.\nAction reverted and their admin has been removed.`
            : `🚫 *AntiHackGC*\n@${authorJid.split("@")[0]} tried to demote someone without permission.\nAction reverted and their admin has been removed.`,
        mentions: [authorJid],
      });
    } catch (e) {
      debug("failed to send antihackgc notice", e?.message || e);
    }
  } catch (error) {
    console.error("[antihackgc] enforcement error:", error);
  }
});
