import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import type OpenAI from "openai";
import { runAgentLoop } from "./agent.js";
import type { Config } from "./config.js";
import type { Memory } from "./memory/index.js";
import type { Bot } from "grammy";
import fs from "fs";
import { InputFile } from "grammy";

export async function createWhatsAppBot(config: Config, client: OpenAI, memory: Memory, bot: Bot) {
    // Ensure the auth directory exists
    const authDir = "./data/whatsapp_auth";
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" }) as any, // Mute baileys logging to prevent console spam
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("Generating QR code image for Telegram...");
            try {
                // Generate QR code as a buffer
                const qrBuffer = await QRCode.toBuffer(qr);

                // Send it to the first allowed user in the config
                const adminId = Array.from(config.allowedUserIds)[0];
                if (adminId) {
                    await bot.api.sendPhoto(adminId, new InputFile(qrBuffer), {
                        caption: "Scan this QR code with your phone's WhatsApp to link Gravity Claw."
                    });
                    console.log(`QR Code sent to Telegram user ${adminId}`);
                }
            } catch (err) {
                console.error("Failed to generate or send QR code to Telegram:", err);
            }
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("WhatsApp connection closed due to ", lastDisconnect?.error, ", reconnecting ", shouldReconnect);
            if (shouldReconnect) {
                // Reconnect logic
                setTimeout(() => createWhatsAppBot(config, client, memory, bot), 5000);
            } else {
                console.log("WhatsApp logged out. Please delete data/whatsapp_auth and restart to trigger a new QR code.");
            }
        } else if (connection === "open") {
            console.log("Gravity Claw WhatsApp client connected successfully.");
            const adminId = Array.from(config.allowedUserIds)[0];
            if (adminId) {
                await bot.api.sendMessage(adminId, "✅ WhatsApp connected successfully.");
            }
        }
    });

    // Serialization lock for each chatter to avoid jumbled history
    const userLocks: Record<string, Promise<void>> = {};

    sock.ev.on("messages.upsert", async (m) => {
        if (m.type !== "notify") return; // Only process new incoming messages (ignore history syncs)

        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const remoteJid = msg.key.remoteJid;
            if (!remoteJid) continue;

            // Extract text content from the message
            let text = msg.message.conversation || msg.message.extendedTextMessage?.text;

            // TODO: Handle media appropriately once multimodal feature is built.
            if (!text && (msg.message.imageMessage || msg.message.audioMessage || msg.message.videoMessage || msg.message.documentMessage)) {
                text = "(User sent media, but multimodal processing is not yet enabled.)";
            }

            if (!text) continue;

            // Process message with a lock per user/group
            if (!userLocks[remoteJid]) {
                userLocks[remoteJid] = Promise.resolve();
            }

            userLocks[remoteJid] = userLocks[remoteJid].then(async () => {
                try {
                    // Indicate typing status
                    await sock.presenceSubscribe(remoteJid);
                    await sock.sendPresenceUpdate("composing", remoteJid);

                    await memory.remember("user", text!);
                    const response = await runAgentLoop(text!, client, config, memory);
                    await memory.remember("assistant", response);

                    // Split long messages if needed, though WhatsApp handles long text better than Telegram.
                    const maxWaLength = 65536; // generous chunk size
                    for (let i = 0; i < response.length; i += maxWaLength) {
                        const chunk = response.slice(i, i + maxWaLength);
                        await sock.sendMessage(remoteJid, { text: chunk });
                    }

                    // Stop typing status
                    await sock.sendPresenceUpdate("paused", remoteJid);
                } catch (err) {
                    console.error(`Error processing WhatsApp message from ${remoteJid}:`, err);
                    await sock.sendMessage(remoteJid, { text: "Something went wrong processing your message." }).catch(() => { });
                }
            });
        }
    });

    return sock;
}
