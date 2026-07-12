const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post('/', (req, res) => {
  const payload = req.body;

  console.log('WhatsApp webhook received:', JSON.stringify(payload));

  return res.sendStatus(200);
});

module.exports = router;
