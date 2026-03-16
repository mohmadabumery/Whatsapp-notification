const querystring = require('querystring');
const crypto = require('crypto');

/**
 * Validates/Generates Twilio Signature
 * Crucial for Dynamics 365 to accept Media attachments
 */
function generateTwilioSignature(authToken, url, params) {
    let signingString = url;
    // Twilio sorts keys alphabetically
    const sortedKeys = Object.keys(params).sort();

    for (const key of sortedKeys) {
        // Handle potential arrays and ensure nulls are empty strings
        const value = params[key] !== undefined && params[key] !== null ? params[key] : '';
        signingString += key + value;
    }

    return crypto
        .createHmac('sha1', authToken)
        .update(signingString)
        .digest('base64');
}

module.exports = async (req, res) => {
    console.log('1. Request received:', req.method);

    if (req.method !== 'POST') {
        return res.status(200).send('OK');
    }

    const body = req.body;

    // Basic Validation
    if (!body || !body.From) {
        console.log('3. Missing From field - stopping');
        return res.status(200).send('OK');
    }

    // Ensure Body is at least an empty string if media exists 
    // Dynamics often ignores attachments if the Body field is strictly 'undefined'
    if (!body.Body && body.MediaUrl0) {
        body.Body = ''; 
    }

    const dynamicsUrl = 'https://m-6be3abd6-b0bf-f011-89f5-000d3ad8817c.eu.omnichannelengagementhub.com/whatsapp-twilio/incoming?orgId=6be3abd6-b0bf-f011-89f5-000d3ad8817c';

    // Generate valid signature including all Media fields
    const signature = generateTwilioSignature(
        process.env.TWILIO_AUTH_TOKEN,
        dynamicsUrl,
        body
    );

    const payload = querystring.stringify(body);

    console.log(`4. Forwarding to Dynamics (Media: ${body.NumMedia || 0})...`);
    
    try {
        const dynamicsRes = await fetch(dynamicsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Twilio-Signature': signature,
                'User-Agent': 'TwilioProxy/1.1',
                'Host': 'm-6be3abd6-b0bf-f011-89f5-000d3ad8817c.eu.omnichannelengagementhub.com'
            },
            body: payload
        });
        const responseText = await dynamicsRes.text();
        console.log('5. Dynamics status:', dynamicsRes.status, 'Response:', responseText);
    } catch (err) {
        console.error('5. Dynamics error:', err.message);
    }

    // Notify Power Automate
    // We send this for both text and media now
    console.log('6. Calling Power Automate...');
    try {
        await fetch(process.env.POWER_AUTOMATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                From: body.From,
                // Provide a fallback text for the email if it's just a file
                Body: body.Body || `[Attachment: ${body.MediaContentType0 || 'File'}]`,
                ProfileName: body.ProfileName || 'Unknown',
                MessageSid: body.MessageSid || '',
                MediaUrl: body.MediaUrl0 || '' // Added so you can see the link in email
            })
        });
        console.log('7. Power Automate status sent');
    } catch (err) {
        console.error('7. Power Automate error:', err.message);
    }

    console.log('8. Done - sending 200 to Twilio');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};
