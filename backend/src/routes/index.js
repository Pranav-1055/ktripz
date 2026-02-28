const express = require('express');
const { sendResponse } = require('../middleware');

// Import route modules
const authRoutes = require('./auth');
const userRoutes = require('./users');
const rideRoutes = require('./rides');
const walletRoutes = require('./wallet');
const payoutRoutes = require('./payouts');
// const externalVehicleRoutes = require('./externalVehicles'); // Removed per user request
const vehicleRoutes = require('./vehicles');
const mapsRoutes = require('./maps');
const searchRoutes = require('./search');
const bookingRoutes = require('./bookings');
const realtimeRoutes = require('./realtime');
const notificationRoutes = require('./notifications');
const paymentRoutes = require('./payments');
const financialRoutes = require('./financial');
const reviewRoutes = require('./reviews');
const messageRoutes = require('./messages');
const communicationRoutes = require('./communication');
const analyticsRoutes = require('./analytics');
const cacheRoutes = require('./cache');
const transportProviderRoutes = require('./transportProviders');
const adminRoutes = require('../admin/routes');
const stopRoutes = require('./stops');
const routesRoutes = require('./routes');

/**
 * Setup all API routes
 */
function setupRoutes(app) {
  // API base route
  const apiRouter = express.Router();

  // API info endpoint
  apiRouter.get('/', (req, res) => {
    sendResponse(res, 200, {
      name: 'TripO Backend API',
      version: '1.0.0',
      description: 'BlaBlaCar-like ride sharing backend API',
      endpoints: {
        health: '/health',
        api: '/api',
        auth: '/api/auth',
        users: '/api/users',
        rides: '/api/rides',
        vehicles: '/api/vehicles',
        maps: '/api/maps',
        bookings: '/api/bookings',
        search: '/api/search',
        realtime: '/api/realtime',
        notifications: '/api/notifications',
        payments: '/api/payments',
        financial: '/api/financial',
        reviews: '/api/reviews',
        messages: '/api/messages',
        communication: '/api/communication',
        analytics: '/api/analytics',
        cache: '/api/cache',
        transportProviders: '/api/transport-providers',
        routes: '/api/routes',
        wallet: '/api/wallet',
        payouts: '/api/payouts',
        externalVehicles: '/api/external-vehicles',
      },
    }, 'TripO Backend API is running');
  });

  // Mount route modules

  apiRouter.use('/users', userRoutes);
  apiRouter.use('/wallet', walletRoutes);
  apiRouter.use('/payouts', payoutRoutes);
  // apiRouter.use('/external-vehicles', externalVehicleRoutes); // Removed per user request
  apiRouter.use('/rides', rideRoutes);
  apiRouter.use('/vehicles', vehicleRoutes);
  apiRouter.use('/maps', mapsRoutes);
  apiRouter.use('/search', searchRoutes);
  apiRouter.use('/bookings', bookingRoutes);
  apiRouter.use('/realtime', realtimeRoutes);
  apiRouter.use('/notifications', notificationRoutes);
  apiRouter.use('/payments', paymentRoutes);
  apiRouter.use('/financial', financialRoutes);
  apiRouter.use('/reviews', reviewRoutes);
  apiRouter.use('/messages', messageRoutes);
  apiRouter.use('/communication', communicationRoutes);
  apiRouter.use('/analytics', analyticsRoutes);
  apiRouter.use('/cache', cacheRoutes);
  apiRouter.use('/transport-providers', transportProviderRoutes);
  apiRouter.use('/admin', adminRoutes);
  apiRouter.use('/stops', stopRoutes);
  apiRouter.use('/routes', routesRoutes);
  apiRouter.use('/uploads', require('./uploads'));

  // Mount auth routes explicitly
  app.use('/api/auth', authRoutes);

  // Mount API router
  app.use('/api', apiRouter);
}

module.exports = {
  setupRoutes,
};