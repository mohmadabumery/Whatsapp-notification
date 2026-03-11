const querystring = require('querystring');
const crypto = require('crypto');

function generateTwilioSignature(authToken, url, params) {
  const sortedKeys = Object.keys(params).sort();
  let signingString = url;
  sortedKeys.forEach(key => {
    signingString += key + params[key];
  });
  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(signingString, 'utf-8'))
    .digest('base64');
}

module.exports = async (req, res) => {
  console.log('1. Request received:', req.method);

  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const body = req.body;

  if (!body || !body.From || !body.Body) {
    console.log('3. Missing fields - stopping');
    return res.status(200).send('OK');
  }

  // Re-sign request for Dynamics
  const dynamicsUrl = 'https://m-6be3abd6-b0bf-f011-89f5-000d3ad8817c.eu.omnichannelengagementhub.com/whatsapp-twilio/incoming?orgId=6be3abd6-b0bf-f011-89f5-000d3ad8817c';
  const signature = generateTwilioSignature(
    process.env.TWILIO_AUTH_TOKEN,
    dynamicsUrl,
    body
  );

  // Forward to Dynamics
  console.log('4. Forwarding to Dynamics...');
  try {
    const dynamicsRes = await fetch(
      dynamicsUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': signature,
          'User-Agent': 'TwilioProxy/1.1'
        },
        body: querystring.stringify(body)
      }
    );
    console.log('5. Dynamics response status:', dynamicsRes.status);
  } catch (err) {
    console.error('5. Dynamics error:', err.message);
  }

  // Notify Power Automate
  console.log('6. Calling Power Automate...');
  try {
    const paRes = await fetch(
      process.env.POWER_AUTOMATE_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: body.From,
          Body: body.Body,
          ProfileName: body.ProfileName || 'Unknown',
          MessageSid: body.MessageSid || ''
        })
      }
    );
    console.log('7. Power Automate response status:', paRes.status);
  } catch (err) {
    console.error('7. Power Automate error:', err.message);
  }

  console.log('8. Done - sending 200 to Twilio');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};
