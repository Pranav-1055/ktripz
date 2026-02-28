const { Server } = require('socket.io');
const logger = require('../utils/logger');
const { verifyFirebaseToken } = require('../middleware/auth');

let io;

/**
 * Initialize Socket.io server
 * @param {Object} server - HTTP server instance
 * @returns {Object} Socket.io server instance
 */
function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(token);
      socket.userId = decodedToken.uid;
      socket.userEmail = decodedToken.email;
      
      logger.info(`Socket authenticated for user: ${socket.userId}`);
      next();
    } catch (error) {
      logger.error('Socket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handling
  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId} (${socket.id})`);

    // Join user to their personal room for targeted notifications
    socket.join(`user_${socket.userId}`);

    // Handle user joining ride-specific rooms
    socket.on('join_ride', (rideId) => {
      socket.join(`ride_${rideId}`);
      logger.info(`User ${socket.userId} joined ride room: ${rideId}`);
    });

    // Handle user leaving ride-specific rooms
    socket.on('leave_ride', (rideId) => {
      socket.leave(`ride_${rideId}`);
      logger.info(`User ${socket.userId} left ride room: ${rideId}`);
    });

    // Handle user joining booking-specific rooms
    socket.on('join_booking', (bookingId) => {
      socket.join(`booking_${bookingId}`);
      logger.info(`User ${socket.userId} joined booking room: ${bookingId}`);
    });

    // Handle user leaving booking-specific rooms
    socket.on('leave_booking', (bookingId) => {
      socket.leave(`booking_${bookingId}`);
      logger.info(`User ${socket.userId} left booking room: ${bookingId}`);
    });

    // Handle user joining conversation rooms
    socket.on('join_conversation', (conversationId) => {
      socket.join(`conversation_${conversationId}`);
      logger.info(`User ${socket.userId} joined conversation room: ${conversationId}`);
    });

    // Handle user leaving conversation rooms
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation_${conversationId}`);
      logger.info(`User ${socket.userId} left conversation room: ${conversationId}`);
    });

    // Handle location sharing for trip tracking
    socket.on('share_location', (data) => {
      const { rideId, location } = data;
      
      // Broadcast location to all users in the ride room
      socket.to(`ride_${rideId}`).emit('location_update', {
        userId: socket.userId,
        location,
        timestamp: new Date().toISOString(),
      });
      
      logger.info(`Location shared by user ${socket.userId} for ride ${rideId}`);
    });

    // Handle typing indicators for messaging
    socket.on('typing_start', (data) => {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        typing: true,
      });
    });

    socket.on('typing_stop', (data) => {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        typing: false,
      });
    });

    // Handle message delivery confirmation
    socket.on('message_delivered', (data) => {
      const { messageId, conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('message_delivery_confirmed', {
        messageId,
        deliveredBy: socket.userId,
        deliveredAt: new Date().toISOString(),
      });
    });

    // Handle message read confirmation
    socket.on('message_read', (data) => {
      const { messageId, conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('message_read_confirmed', {
        messageId,
        readBy: socket.userId,
        readAt: new Date().toISOString(),
      });
    });

    // Handle user online status
    socket.on('user_online', () => {
      socket.broadcast.emit('user_status_changed', {
        userId: socket.userId,
        status: 'online',
        lastSeen: new Date().toISOString(),
      });
    });

    // Handle user going offline
    socket.on('user_offline', () => {
      socket.broadcast.emit('user_status_changed', {
        userId: socket.userId,
        status: 'offline',
        lastSeen: new Date().toISOString(),
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`User disconnected: ${socket.userId} (${socket.id}) - Reason: ${reason}`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.userId}:`, error);
    });
  });

  logger.info('Socket.io server initialized successfully');
  return io;
}

/**
 * Get Socket.io server instance
 * @returns {Object} Socket.io server instance
 */
function getSocketInstance() {
  if (!io) {
    throw new Error('Socket.io server not initialized');
  }
  return io;
}

/**
 * Emit real-time ride availability updates
 * @param {string} rideId - Ride ID
 * @param {Object} updateData - Update data
 */
function emitRideUpdate(rideId, updateData) {
  if (!io) return;
  
  io.to(`ride_${rideId}`).emit('ride_updated', {
    rideId,
    ...updateData,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`Ride update emitted for ride ${rideId}:`, updateData);
}

/**
 * Emit booking status change notifications
 * @param {string} bookingId - Booking ID
 * @param {string} userId - User ID to notify
 * @param {Object} statusData - Status change data
 */
function emitBookingStatusChange(bookingId, userId, statusData) {
  if (!io) return;
  
  io.to(`user_${userId}`).emit('booking_status_changed', {
    bookingId,
    ...statusData,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`Booking status change emitted for user ${userId}:`, statusData);
}

/**
 * Emit trip tracking updates
 * @param {string} rideId - Ride ID
 * @param {Object} trackingData - Trip tracking data
 */
function emitTripTracking(rideId, trackingData) {
  if (!io) return;
  
  io.to(`ride_${rideId}`).emit('trip_tracking_update', {
    rideId,
    ...trackingData,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`Trip tracking update emitted for ride ${rideId}:`, trackingData);
}

/**
 * Emit notification to specific user
 * @param {string} userId - User ID
 * @param {Object} notification - Notification data
 */
function emitUserNotification(userId, notification) {
  if (!io) return;
  
  io.to(`user_${userId}`).emit('notification', {
    ...notification,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`Notification emitted to user ${userId}:`, notification);
}

/**
 * Emit message to conversation participants
 * @param {string} conversationId - Conversation ID
 * @param {Object} messageData - Message data
 */
function emitMessage(conversationId, messageData) {
  if (!io) return;
  
  io.to(`conversation_${conversationId}`).emit('new_message', {
    conversationId,
    ...messageData,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`Message emitted to conversation ${conversationId}:`, messageData);
}

/**
 * Emit message delivery confirmation
 * @param {string} conversationId - Conversation ID
 * @param {string} messageId - Message ID
 * @param {string} userId - User ID who delivered the message
 */
function emitMessageDelivered(conversationId, messageId, userId) {
  if (!io) return;
  
  io.to(`conversation_${conversationId}`).emit('message_delivered', {
    messageId,
    conversationId,
    deliveredBy: userId,
    deliveredAt: new Date().toISOString(),
  });
  
  logger.info(`Message delivery confirmation emitted for message ${messageId}`);
}

/**
 * Emit message read confirmation
 * @param {string} conversationId - Conversation ID
 * @param {string} messageId - Message ID
 * @param {string} userId - User ID who read the message
 */
function emitMessageRead(conversationId, messageId, userId) {
  if (!io) return;
  
  io.to(`conversation_${conversationId}`).emit('message_read', {
    messageId,
    conversationId,
    readBy: userId,
    readAt: new Date().toISOString(),
  });
  
  logger.info(`Message read confirmation emitted for message ${messageId}`);
}

/**
 * Emit typing indicator
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID who is typing
 * @param {boolean} isTyping - Whether user is typing
 */
function emitTypingIndicator(conversationId, userId, isTyping) {
  if (!io) return;
  
  io.to(`conversation_${conversationId}`).emit('typing_indicator', {
    conversationId,
    userId,
    isTyping,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`Typing indicator emitted for user ${userId} in conversation ${conversationId}: ${isTyping}`);
}

/**
 * Emit user online status
 * @param {string} userId - User ID
 * @param {string} status - Online status (online, offline, away)
 */
function emitUserStatus(userId, status) {
  if (!io) return;
  
  io.emit('user_status_changed', {
    userId,
    status,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`User status emitted for user ${userId}: ${status}`);
}

/**
 * Emit message to booking participants (legacy support)
 * @param {string} bookingId - Booking ID
 * @param {Object} messageData - Message data
 */
function emitBookingMessage(bookingId, messageData) {
  if (!io) return;
  
  io.to(`booking_${bookingId}`).emit('message_received', {
    bookingId,
    ...messageData,
    timestamp: new Date().toISOString(),
  });
  
  logger.info(`Message emitted to booking ${bookingId}:`, messageData);
}

/**
 * Get connected users count
 * @returns {number} Number of connected users
 */
function getConnectedUsersCount() {
  if (!io) return 0;
  return io.engine.clientsCount;
}

/**
 * Get users in specific room
 * @param {string} room - Room name
 * @returns {Promise<Set>} Set of socket IDs in the room
 */
async function getUsersInRoom(room) {
  if (!io) return new Set();
  return await io.in(room).allSockets();
}

module.exports = {
  initializeSocket,
  getSocketInstance,
  emitRideUpdate,
  emitBookingStatusChange,
  emitTripTracking,
  emitUserNotification,
  emitMessage,
  emitMessageDelivered,
  emitMessageRead,
  emitTypingIndicator,
  emitUserStatus,
  emitBookingMessage,
  getConnectedUsersCount,
  getUsersInRoom,
};