const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Server đang hoạt động',
    time: new Date().toISOString()
  });
});

module.exports = router;
