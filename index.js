const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs').promises;
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const PORT = process.env.PORT || 3000;
// Vercel-এর মতো প্ল্যাটফর্মে ফাইল লেখার জন্য /tmp ব্যবহার করা আবশ্যক
const sessionPath = path.join('/tmp', 'cookies'); 

// Middleware
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
            throw new Error("A session already exists. Please delete the session and try again.");
        }
        
        // নাম্বার ফরম্যাটিং: 880 যোগ করা
        const formattedNumber = phoneNumber.startsWith('880') ? phoneNumber : '880' + phoneNumber;
        
        // Auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const tempSock = makeWASocket({
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome'),
            auth: state,
        });
        
        // Request pair code
        const pairCode = await tempSock.requestPairingCode(formattedNumber);
        
        // Handle events
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
        
        // সফলভাবে কোড তৈরি হলে pairCode এবং মেসেজ পাঠানো
        res.status(200).json({ 
            success: true, 
            pairCode: pairCode,
            message: "Pair code generated successfully. Enter this code in your WhatsApp app." 
        });

    } catch (err) {
        console.error("Error generating pair code:", err);
        res.status(500).json({ error: err.message || 'Failed to generate pair code.' });
    }
});

// Send creds.json to WhatsApp
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

// Run Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

