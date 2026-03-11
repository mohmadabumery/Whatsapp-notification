const querystring = require('querystring');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const body = req.body;

  if (!body || !body.From) {
    return res.status(200).send('OK');
  }

  // Only process inbound messages
  if (!body.Body) {
    return res.status(200).send('OK');
  }

  try {
    // 1. Forward to Dynamics CS
    await fetch(
      'https://m-6be3abd6-b0bf-f011-89f5-000d3ad8817c.eu.omnichannelengagementhub.com/whatsapp-twilio/incoming?orgId=6be3abd6-b0bf-f011-89f5-000d3ad8817c',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: querystring.stringify(body)
      }
    );

    // 2. Notify Power Automate
    await fetch(process.env.POWER_AUTOMATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: body.From,
        Body: body.Body,
        ProfileName: body.ProfileName || 'Unknown',
        MessageSid: body.MessageSid || ''
      })
    });

  } catch (err) {
    console.error('Error:', err);
  }

  // Always return 200 to Twilio immediately
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};
