const express = require('express');
const router = express.Router();
const { getDashboardPayload } = require('../utils/payroll');

router.get('/', async (req, res) => {
  try {
    const payload = await getDashboardPayload();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
