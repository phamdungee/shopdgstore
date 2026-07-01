const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Server đang hoạt động',
    time: new Date().toISOString()
  });
});

router.get('/debug-ip', (req, res) => {
  res.json({
    ip: req.ip,
    ips: req.ips,
    forwarded: req.headers['x-forwarded-for'],
    cfConnectingIp: req.headers['cf-connecting-ip']
  });
});

module.exports = router;
