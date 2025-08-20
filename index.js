const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
const sessionPath = path.join(__dirname, 'cookies');
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Generate Pair Code
app.post('/api/paircode', async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }

    try {
        await fs.mkdir(sessionPath, { recursive: true });
        const pairCode = await generatePairCode(phoneNumber);
        res.status(200).json({ success: true, pairCode });
    } catch (err) {
        console.error("Error generating pair code:", err);
        res.status(500).json({ error: err.message || 'Failed to generate pair code.' });
    }
});

// Generate Pair Code Function
async function generatePairCode(phoneNumber) {
    const isExistingSession = await fs.access(path.join(sessionPath, 'creds.json'))
        .then(() => true)
        .catch(() => false);

    if (isExistingSession) {
        throw new Error("A session already exists. Please delete the session and try again.");
    }
    
    const formattedNumber = phoneNumber.startsWith('880') ? phoneNumber : '880' + phoneNumber;
    console.log(`Generating pair code for number: ${formattedNumber}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const tempSock = makeWASocket({
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome'),
        auth: state,
    });
    
    const pairCode = await tempSock.requestPairingCode(formattedNumber);
    
    tempSock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log("✅ Pairing successful! Creds.json saved.");
            await sendCredsToWhatsApp(tempSock, formattedNumber);
            tempSock.end();
        } else if (connection === 'close') {
            console.log("❌ Connection closed.");
        }
    });
    
    tempSock.ev.on('creds.update', saveCreds);
    
    return pairCode;
}

async function sendCredsToWhatsApp(sock, jid) {
    const credsFilePath = path.join(sessionPath, 'creds.json');
    try {
        const creds = await fs.readFile(credsFilePath, 'utf-8');
        const message = "Here is your creds.json content:\n\n```json\n" + creds + "\n```";

        await sock.sendMessage(jid + "@s.whatsapp.net", { text: message });
        console.log("✅ creds.json content sent successfully to the user's number.");
    } catch (error) {
        console.error("❌ Failed to send creds.json content to WhatsApp:", error);
    }
}

// 👉 লোকাল হলে server run হবে, vercel এ module export হবে
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
} else {
    module.exports = app;
}
