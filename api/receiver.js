const querystring = require('querystring');
const crypto = require('crypto');

function generateTwilioSignature(authToken, url, params) {
    // Twilio signature requires the URL + sorted key-value pairs
    let signingString = url;
    const sortedKeys = Object.keys(params).sort();

    for (const key of sortedKeys) {
        // Twilio expects the raw value, not the URL-encoded value for the signature
        const value = params[key] !== undefined && params[key] !== null ? params[key] : '';
        signingString += key + value;
    }

    return crypto
        .createHmac('sha1', authToken)
        .update(signingString)
        .digest('base64');
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    if (!body || !body.From) return res.status(200).send('OK');

    // Crucial: Dynamics needs the Body field to exist, even if empty
    if (!body.Body) body.Body = '';

    // The EXACT Dynamics Webhook URL (no trailing spaces)
    const dynamicsUrl = 'https://m-6be3abd6-b0bf-f011-89f5-000d3ad8817c.eu.omnichannelengagementhub.com/whatsapp-twilio/incoming?orgId=6be3abd6-b0bf-f011-89f5-000d3ad8817c';

    // Create a new signature specifically for the Dynamics URL
    const newSignature = generateTwilioSignature(
        process.env.TWILIO_AUTH_TOKEN,
        dynamicsUrl,
        body
    );

    try {
        // Forward to Dynamics
        await fetch(dynamicsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Twilio-Signature': newSignature,
                'User-Agent': 'TwilioProxy/1.1'
            },
            body: querystring.stringify(body)
        });
    } catch (err) {
        console.error('Dynamics Error:', err.message);
    }

    // Power Automate Notification
    try {
        await fetch(process.env.POWER_AUTOMATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                From: body.From,
                Body: body.Body || `[Media Attachment]`,
                ProfileName: body.ProfileName || 'User',
                MessageSid: body.MessageSid,
                MediaUrl: body.MediaUrl0 || ''
            })
        });
    } catch (err) {
        console.error('PA Error:', err.message);
    }

    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};
