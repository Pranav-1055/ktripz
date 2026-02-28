const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Placeholder routes
router.get('/', authMiddleware.authenticateToken, (req, res) => {
    res.json({ success: true, message: 'Wallet route placeholder' });
});

module.exports = router;
