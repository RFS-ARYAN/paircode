const express = require('express');
const app = express();
const path = require('path');
const { generatePairCode } = require('./bot/login/log.js');

const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'paircode.html'));
});

app.post('/api/generate-paircode', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }
    
    try {
        const pairCode = await generatePairCode(phoneNumber);
        res.json({ pairCode });
    } catch (err) {
        console.error("Error generating pair code:", err);
        res.status(500).json({ error: 'Failed to generate pair code.' });
    }
});

app.listen(port, () => {
    console.log(`Paircode server running on http://localhost:${port}`);
    console.log("Open this link in your browser to get the paircode.");
});
