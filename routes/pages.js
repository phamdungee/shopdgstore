
const express = require('express');
const path = require('path');
const router = express.Router();

router.get('/product/sanpham/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'product', 'sanpham', 'index.html'));
});

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'home.html'));
});

module.exports = router;
