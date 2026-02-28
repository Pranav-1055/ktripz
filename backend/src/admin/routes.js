const express = require('express');
const router = express.Router();
const adminController = require('./controller');
const { authenticateAdmin } = require('./middleware');

// Public Admin Route
router.post('/login', adminController.login);

// Protected Admin Routes
router.get('/dashboard', authenticateAdmin, adminController.getDashboardStats);
router.get('/users', authenticateAdmin, adminController.getUsers);
router.delete('/user/:id', authenticateAdmin, adminController.deleteUser);
router.patch('/user/:id', authenticateAdmin, adminController.updateUserStatus);

// Stop Management Routes (Protected)
router.post('/stops', authenticateAdmin, adminController.addStop);
router.get('/stops', authenticateAdmin, adminController.getStops);
router.delete('/stops/:id', authenticateAdmin, adminController.deleteStop);

// Route Management Routes (Protected)
router.post('/routes', authenticateAdmin, adminController.addRoute);
router.get('/routes', authenticateAdmin, adminController.getRoutes);
router.patch('/routes/:id', authenticateAdmin, adminController.updateRoute);
router.delete('/routes/:id', authenticateAdmin, adminController.deleteRoute);

module.exports = router;
