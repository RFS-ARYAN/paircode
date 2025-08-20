const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs').promises;
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const PORT = process.env.PORT || 3000;
const sessionPath = path.join('/tmp', 'cookies'); 

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// paircode.html ফাইলটি সার্ভ করা হচ্ছে
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'paircode.html'));
});

// API: Generate Pair Code
app.post('/api/paircode', async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }

    try {
        await fs.mkdir(sessionPath, { recursive: true });
        
        const isExistingSession = await fs.access(path.join(sessionPath, 'creds.json'))
            .then(() => true)
            .catch(() => false);

        if (isExistingSession) {
            // যদি সেশন আগে থেকেই থাকে তাহলে নতুন করে তৈরি না করা
            throw new Error("A session already exists. Please delete the session and try again.");
        }
        
        const formattedNumber = phoneNumber.startsWith('880') ? phoneNumber : '880' + phoneNumber;
        
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
                console.log("✅ Pairing successful!");
                await sendCredsToWhatsApp(tempSock, formattedNumber);
                tempSock.end(); // সেশন সফল হলে সকেট বন্ধ করে দেওয়া
            } else if (connection === 'close') {
                console.log("❌ Connection closed.");
                // যদি সেশন সংযোগ বিচ্ছিন্ন হয়ে যায়, সেশন ফাইল মুছে ফেলা
                try {
                    await fs.rm(sessionPath, { recursive: true, force: true });
                    console.log("Deleted old session files.");
                } catch (e) {
                    console.error("Failed to delete session files:", e);
                }
            }
        });
        
        tempSock.ev.on('creds.update', saveCreds);
        
        res.status(200).json({ 
            success: true, 
            pairCode: pairCode,
            message: "Pair code generated. Now enter it on your WhatsApp app." 
        });

    } catch (err) {
        console.error("Error generating pair code:", err);
        res.status(500).json({ error: err.message || 'Failed to generate pair code.' });
    }
});

async function sendCredsToWhatsApp(sock, jid) {
    const credsFilePath = path.join(sessionPath, 'creds.json');
    try {
        const creds = await fs.readFile(credsFilePath, 'utf-8');
        const message = "Here is your creds.json content:\n\n```json\n" + creds + "\n```";

        await sock.sendMessage(jid + "@s.whatsapp.net", { text: message });
        console.log("✅ creds.json content sent successfully.");
    } catch (error) {
        console.error("❌ Failed to send creds.json content to WhatsApp:", error);
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
