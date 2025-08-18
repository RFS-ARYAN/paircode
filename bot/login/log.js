const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const sessionPath = path.join(__dirname, '..', '..', 'cookies');

async function generatePairCode(phoneNumber) {
    const isExistingSession = fs.existsSync(path.join(sessionPath, 'creds.json'));
    if (isExistingSession) {
        throw new Error("A session already exists. Please log out first.");
    }

    console.log(`Generating pair code for number: ${phoneNumber}`);
    
    // Create the session folder if it doesn't exist
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath);
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const tempSock = makeWASocket({
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome'),
        auth: state,
    });
    
    const pairCode = await tempSock.requestPairingCode(phoneNumber);
    
    tempSock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
            console.log("Pairing successful! Creds.json saved.");
            tempSock.end(); 
        }
    });
    
    tempSock.ev.on('creds.update', saveCreds);
    
    return pairCode;
}

module.exports = { generatePairCode };
