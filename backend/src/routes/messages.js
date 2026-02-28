const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { sendResponse, sendError } = require('../middleware');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const User = require('../models/User');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/messages/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'message-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * @route POST /api/messages
 * @desc Send a new message
 * @access Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { conversationId, toUserId, content, type = 'text', metadata = {} } = req.body;
    const fromUserId = req.user.uid;

    // Validate required fields
    if (!conversationId || !toUserId || !content) {
      return sendError(res, 400, 'MISSING_FIELDS', 'Conversation ID, recipient, and content are required');
    }

    // Verify that the sender has permission to send messages in this conversation
    // For booking-based conversations, check if user is part of the booking
    if (conversationId.startsWith('booking_')) {
      const bookingId = conversationId.replace('booking_', '');
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      
      if (booking.passengerId !== fromUserId && booking.driverId !== fromUserId) {
        return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to send messages in this conversation');
      }
      
      // Ensure the recipient is the other party in the booking
      const expectedToUserId = booking.passengerId === fromUserId ? booking.driverId : booking.passengerId;
      if (toUserId !== expectedToUserId) {
        return sendError(res, 400, 'INVALID_RECIPIENT', 'Invalid recipient for this conversation');
      }
    }

    // Create and save the message
    const message = await Message.create({
      conversationId,
      fromUserId,
      toUserId,
      content,
      type,
      metadata
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${toUserId}`).emit('new_message', {
        message: message.toJSON(),
        conversationId
      });
      
      io.to(`user_${fromUserId}`).emit('message_sent', {
        message: message.toJSON(),
        conversationId
      });
    }

    sendResponse(res, 201, message.toJSON(), 'Message sent successfully');
  } catch (error) {
    logger.error('Error sending message:', error);
    sendError(res, 500, 'MESSAGE_SEND_FAILED', 'Failed to send message');
  }
});

/**
 * @route POST /api/messages/photo
 * @desc Send a photo message
 * @access Private
 */
router.post('/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { conversationId, toUserId } = req.body;
    const fromUserId = req.user.uid;

    if (!req.file) {
      return sendError(res, 400, 'NO_FILE', 'Photo file is required');
    }

    if (!conversationId || !toUserId) {
      return sendError(res, 400, 'MISSING_FIELDS', 'Conversation ID and recipient are required');
    }

    // Verify conversation permissions (same as text messages)
    if (conversationId.startsWith('booking_')) {
      const bookingId = conversationId.replace('booking_', '');
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      
      if (booking.passengerId !== fromUserId && booking.driverId !== fromUserId) {
        return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to send messages in this conversation');
      }
    }

    // Create photo message
    const message = await Message.create({
      conversationId,
      fromUserId,
      toUserId,
      content: 'Photo',
      type: 'photo',
      metadata: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        url: `/uploads/messages/${req.file.filename}`
      }
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${toUserId}`).emit('new_message', {
        message: message.toJSON(),
        conversationId
      });
      
      io.to(`user_${fromUserId}`).emit('message_sent', {
        message: message.toJSON(),
        conversationId
      });
    }

    sendResponse(res, 201, message.toJSON(), 'Photo sent successfully');
  } catch (error) {
    logger.error('Error sending photo:', error);
    sendError(res, 500, 'PHOTO_SEND_FAILED', 'Failed to send photo');
  }
});

/**
 * @route POST /api/messages/location
 * @desc Send a location message
 * @access Private
 */
router.post('/location', authenticateToken, async (req, res) => {
  try {
    const { conversationId, toUserId, latitude, longitude, address } = req.body;
    const fromUserId = req.user.uid;

    if (!conversationId || !toUserId || !latitude || !longitude) {
      return sendError(res, 400, 'MISSING_FIELDS', 'Conversation ID, recipient, latitude, and longitude are required');
    }

    // Verify conversation permissions
    if (conversationId.startsWith('booking_')) {
      const bookingId = conversationId.replace('booking_', '');
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      
      if (booking.passengerId !== fromUserId && booking.driverId !== fromUserId) {
        return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to send messages in this conversation');
      }
    }

    // Create location message
    const message = await Message.create({
      conversationId,
      fromUserId,
      toUserId,
      content: address || `Location: ${latitude}, ${longitude}`,
      type: 'location',
      metadata: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || null
      }
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${toUserId}`).emit('new_message', {
        message: message.toJSON(),
        conversationId
      });
      
      io.to(`user_${fromUserId}`).emit('message_sent', {
        message: message.toJSON(),
        conversationId
      });
    }

    sendResponse(res, 201, message.toJSON(), 'Location sent successfully');
  } catch (error) {
    logger.error('Error sending location:', error);
    sendError(res, 500, 'LOCATION_SEND_FAILED', 'Failed to send location');
  }
});

/**
 * @route GET /api/messages/conversations
 * @desc Get user's conversations
 * @access Private
 */
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const conversations = await Message.getUserConversations(userId);

    // Enrich conversations with participant details
    const enrichedConversations = await Promise.all(
      conversations.map(async (conv) => {
        try {
          // Extract participant IDs from conversation
          let participantIds = [];
          
          if (conv.conversationId.startsWith('booking_')) {
            const bookingId = conv.conversationId.replace('booking_', '');
            const booking = await Booking.findById(bookingId);
            if (booking) {
              participantIds = [booking.passengerId, booking.driverId].filter(id => id !== userId);
            }
          } else if (conv.metadata.participants) {
            participantIds = conv.metadata.participants.filter(id => id !== userId);
          }

          // Get participant details
          const participants = await Promise.all(
            participantIds.map(async (participantId) => {
              try {
                const user = await User.findById(participantId);
                return user ? {
                  id: user.id,
                  name: user.profile?.name || 'Unknown User',
                  avatar: user.profile?.avatar || null
                } : null;
              } catch (error) {
                logger.error(`Error fetching participant ${participantId}:`, error);
                return null;
              }
            })
          );

          return {
            ...conv,
            participants: participants.filter(p => p !== null)
          };
        } catch (error) {
          logger.error(`Error enriching conversation ${conv.conversationId}:`, error);
          return conv;
        }
      })
    );

    sendResponse(res, 200, enrichedConversations, 'Conversations retrieved successfully');
  } catch (error) {
    logger.error('Error getting conversations:', error);
    sendError(res, 500, 'CONVERSATIONS_FETCH_FAILED', 'Failed to retrieve conversations');
  }
});

/**
 * @route GET /api/messages/conversations/:conversationId
 * @desc Get messages for a specific conversation
 * @access Private
 */
router.get('/conversations/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.uid;
    const { limit = 50, before } = req.query;

    // Verify user has access to this conversation
    if (conversationId.startsWith('booking_')) {
      const bookingId = conversationId.replace('booking_', '');
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      
      if (booking.passengerId !== userId && booking.driverId !== userId) {
        return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this conversation');
      }
    }

    // Get messages
    const messages = await Message.getConversationMessages(conversationId, {
      limit: parseInt(limit),
      before
    });

    // Mark messages as delivered for the current user
    const undeliveredMessages = messages.filter(msg => 
      msg.toUserId === userId && !msg.isDelivered
    );

    await Promise.all(
      undeliveredMessages.map(msg => msg.markAsDelivered())
    );

    sendResponse(res, 200, messages.map(msg => msg.toJSON()), 'Messages retrieved successfully');
  } catch (error) {
    logger.error('Error getting conversation messages:', error);
    sendError(res, 500, 'MESSAGES_FETCH_FAILED', 'Failed to retrieve messages');
  }
});

/**
 * @route PUT /api/messages/:messageId/read
 * @desc Mark message as read
 * @access Private
 */
router.put('/:messageId/read', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.uid;

    // Get the message
    const db = require('../config/firebase').getFirestore();
    const messageDoc = await db.collection('messages').doc(messageId).get();
    
    if (!messageDoc.exists) {
      return sendError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = new Message(messageDoc.data());

    // Verify user is the recipient
    if (message.toUserId !== userId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'You can only mark your own messages as read');
    }

    // Mark as read
    await message.markAsRead();

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${message.fromUserId}`).emit('message_read', {
        messageId: message.id,
        conversationId: message.conversationId,
        readAt: message.readAt
      });
    }

    sendResponse(res, 200, message.toJSON(), 'Message marked as read');
  } catch (error) {
    logger.error('Error marking message as read:', error);
    sendError(res, 500, 'MESSAGE_READ_FAILED', 'Failed to mark message as read');
  }
});

/**
 * @route POST /api/messages/templates/:templateType
 * @desc Send an automated template message
 * @access Private
 */
router.post('/templates/:templateType', authenticateToken, async (req, res) => {
  try {
    const { templateType } = req.params;
    const { conversationId, toUserId, templateData = {} } = req.body;
    const fromUserId = req.user.uid;

    if (!conversationId || !toUserId) {
      return sendError(res, 400, 'MISSING_FIELDS', 'Conversation ID and recipient are required');
    }

    // Verify conversation permissions
    if (conversationId.startsWith('booking_')) {
      const bookingId = conversationId.replace('booking_', '');
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      
      if (booking.passengerId !== fromUserId && booking.driverId !== fromUserId) {
        return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to send messages in this conversation');
      }
    }

    // Create template message
    const message = await Message.createTemplate(
      templateType,
      conversationId,
      fromUserId,
      toUserId,
      templateData
    );

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${toUserId}`).emit('new_message', {
        message: message.toJSON(),
        conversationId
      });
      
      io.to(`user_${fromUserId}`).emit('message_sent', {
        message: message.toJSON(),
        conversationId
      });
    }

    sendResponse(res, 201, message.toJSON(), 'Template message sent successfully');
  } catch (error) {
    logger.error('Error sending template message:', error);
    sendError(res, 500, 'TEMPLATE_SEND_FAILED', 'Failed to send template message');
  }
});

/**
 * @route POST /api/messages/conversations/:conversationId/archive
 * @desc Archive a conversation
 * @access Private
 */
router.post('/conversations/:conversationId/archive', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.uid;

    // Verify user has access to this conversation
    if (conversationId.startsWith('booking_')) {
      const bookingId = conversationId.replace('booking_', '');
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      
      if (booking.passengerId !== userId && booking.driverId !== userId) {
        return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to archive this conversation');
      }
    }

    await Message.archiveConversation(conversationId, userId);

    sendResponse(res, 200, { archived: true }, 'Conversation archived successfully');
  } catch (error) {
    logger.error('Error archiving conversation:', error);
    sendError(res, 500, 'ARCHIVE_FAILED', 'Failed to archive conversation');
  }
});

/**
 * @route DELETE /api/messages/:messageId
 * @desc Delete a message
 * @access Private
 */
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.uid;

    // Get the message
    const db = require('../config/firebase').getFirestore();
    const messageDoc = await db.collection('messages').doc(messageId).get();
    
    if (!messageDoc.exists) {
      return sendError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = new Message(messageDoc.data());

    // Verify user is the sender
    if (message.fromUserId !== userId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'You can only delete your own messages');
    }

    // Delete the message
    await message.delete(userId);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${message.toUserId}`).emit('message_deleted', {
        messageId: message.id,
        conversationId: message.conversationId
      });
      
      io.to(`user_${message.fromUserId}`).emit('message_deleted', {
        messageId: message.id,
        conversationId: message.conversationId
      });
    }

    sendResponse(res, 200, { deleted: true }, 'Message deleted successfully');
  } catch (error) {
    logger.error('Error deleting message:', error);
    sendError(res, 500, 'MESSAGE_DELETE_FAILED', 'Failed to delete message');
  }
});

/**
 * @route GET /api/messages/conversations/:conversationId/stats
 * @desc Get conversation statistics
 * @access Private
 */
router.get('/conversations/:conversationId/stats', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.uid;

    // Verify user has access to this conversation
    if (conversationId.startsWith('booking_')) {
      const bookingId = conversationId.replace('booking_', '');
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      }
      
      if (booking.passengerId !== userId && booking.driverId !== userId) {
        return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this conversation');
      }
    }

    const stats = await Message.getConversationStats(conversationId);

    sendResponse(res, 200, stats, 'Conversation statistics retrieved successfully');
  } catch (error) {
    logger.error('Error getting conversation stats:', error);
    sendError(res, 500, 'STATS_FETCH_FAILED', 'Failed to retrieve conversation statistics');
  }
});

/**
 * @route POST /api/messages/trip/:bookingId/coordinate-pickup
 * @desc Send pickup coordination message
 * @access Private
 */
router.post('/trip/:bookingId/coordinate-pickup', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { pickupTime, pickupLocation, driverLocation, estimatedArrival } = req.body;
    const fromUserId = req.user.uid;

    // Get booking details
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    // Verify user is the driver
    if (booking.driverId !== fromUserId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'Only the driver can send pickup coordination messages');
    }

    // Verify booking is active
    if (!['confirmed', 'in_progress'].includes(booking.status)) {
      return sendError(res, 400, 'INVALID_BOOKING_STATUS', 'Pickup coordination can only be sent for active bookings');
    }

    // Send pickup coordination message
    const MessagingService = require('../services/messagingService');
    const message = await MessagingService.sendPickupCoordinationMessage(booking, {
      pickupTime,
      pickupLocation,
      driverLocation,
      estimatedArrival
    });

    // Emit real-time notification
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.passengerId}`).emit('pickup_coordination', {
        bookingId,
        message: message.toJSON(),
        pickupDetails: {
          pickupTime,
          pickupLocation,
          driverLocation,
          estimatedArrival
        }
      });
    }

    sendResponse(res, 201, message.toJSON(), 'Pickup coordination message sent successfully');
  } catch (error) {
    logger.error('Error sending pickup coordination message:', error);
    sendError(res, 500, 'PICKUP_COORDINATION_FAILED', 'Failed to send pickup coordination message');
  }
});

/**
 * @route POST /api/messages/trip/:bookingId/share-live-location
 * @desc Share live location during trip
 * @access Private
 */
router.post('/trip/:bookingId/share-live-location', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { latitude, longitude, address, message } = req.body;
    const fromUserId = req.user.uid;

    if (!latitude || !longitude) {
      return sendError(res, 400, 'MISSING_COORDINATES', 'Latitude and longitude are required');
    }

    // Get booking details
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    // Verify user is part of the booking
    if (booking.passengerId !== fromUserId && booking.driverId !== fromUserId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to share location for this trip');
    }

    // Verify booking is active
    if (!['confirmed', 'in_progress'].includes(booking.status)) {
      return sendError(res, 400, 'INVALID_BOOKING_STATUS', 'Location sharing is only available for active bookings');
    }

    const conversationId = `booking_${bookingId}`;
    const toUserId = booking.passengerId === fromUserId ? booking.driverId : booking.passengerId;

    // Send location update
    const MessagingService = require('../services/messagingService');
    const locationMessage = await MessagingService.sendLocationUpdate(
      conversationId,
      fromUserId,
      toUserId,
      { latitude, longitude, address }
    );

    // Emit real-time location update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${toUserId}`).emit('live_location_update', {
        bookingId,
        fromUserId,
        location: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address,
          timestamp: new Date().toISOString()
        }
      });
    }

    sendResponse(res, 201, locationMessage.toJSON(), 'Live location shared successfully');
  } catch (error) {
    logger.error('Error sharing live location:', error);
    sendError(res, 500, 'LOCATION_SHARE_FAILED', 'Failed to share live location');
  }
});

/**
 * @route GET /api/messages/trip/:bookingId/communication-status
 * @desc Get communication status for a trip
 * @access Private
 */
router.get('/trip/:bookingId/communication-status', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.uid;

    // Get booking details
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    // Verify user is part of the booking
    if (booking.passengerId !== userId && booking.driverId !== userId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this trip communication status');
    }

    // Get communication status
    const MessagingService = require('../services/messagingService');
    const status = await MessagingService.getTripCommunicationStatus(bookingId);

    // Get conversation stats
    const conversationId = `booking_${bookingId}`;
    const conversationStats = await Message.getConversationStats(conversationId);

    const communicationStatus = {
      ...status,
      conversationStats,
      userRole: booking.passengerId === userId ? 'passenger' : 'driver',
      otherParticipant: {
        id: booking.passengerId === userId ? booking.driverId : booking.passengerId,
        role: booking.passengerId === userId ? 'driver' : 'passenger'
      }
    };

    sendResponse(res, 200, communicationStatus, 'Communication status retrieved successfully');
  } catch (error) {
    logger.error('Error getting trip communication status:', error);
    sendError(res, 500, 'STATUS_FETCH_FAILED', 'Failed to retrieve communication status');
  }
});

/**
 * @route POST /api/messages/booking/:bookingId/lifecycle-message
 * @desc Send booking lifecycle message (confirmation, trip updates, etc.)
 * @access Private
 */
router.post('/booking/:bookingId/lifecycle-message', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { event, eventData = {} } = req.body;
    const userId = req.user.uid;

    // Validate event type
    const validEvents = [
      'booking_confirmed', 'trip_starting_soon', 'driver_arrived', 
      'trip_started', 'trip_completed', 'booking_cancelled', 'payment_pending'
    ];
    
    if (!validEvents.includes(event)) {
      return sendError(res, 400, 'INVALID_EVENT', 'Invalid lifecycle event');
    }

    // Get booking details
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    // Verify user is part of the booking
    if (booking.passengerId !== userId && booking.driverId !== userId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to send lifecycle messages for this booking');
    }

    // Handle the lifecycle event
    const MessagingService = require('../services/messagingService');
    await MessagingService.handleBookingLifecycleEvent(booking, event, eventData);

    sendResponse(res, 200, { event, bookingId }, `Lifecycle event '${event}' handled successfully`);
  } catch (error) {
    logger.error('Error handling booking lifecycle message:', error);
    sendError(res, 500, 'LIFECYCLE_MESSAGE_FAILED', 'Failed to handle lifecycle message');
  }
});

/**
 * @route POST /api/messages/booking/:bookingId/emergency-contact-alert
 * @desc Send emergency alert to emergency contacts during trip
 * @access Private
 */
router.post('/booking/:bookingId/emergency-contact-alert', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { alertType, customMessage, alertPassengerContacts = true, alertDriverContacts = true } = req.body;
    const userId = req.user.uid;

    // Validate alert type
    const validAlertTypes = ['trip_emergency', 'breakdown', 'accident', 'location_emergency'];
    if (!validAlertTypes.includes(alertType)) {
      return sendError(res, 400, 'INVALID_ALERT_TYPE', 'Invalid emergency alert type');
    }

    // Get booking details
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    // Verify user is part of the booking
    if (booking.passengerId !== userId && booking.driverId !== userId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to send emergency alerts for this booking');
    }

    // Check if booking is active
    if (!['confirmed', 'in_progress'].includes(booking.status)) {
      return sendError(res, 400, 'INVALID_BOOKING_STATUS', 'Emergency alerts can only be sent for active bookings');
    }

    // Send emergency alert
    const MessagingService = require('../services/messagingService');
    const alertRecord = await MessagingService.sendEmergencyAlert(booking, alertType, {
      alertPassengerContacts,
      alertDriverContacts,
      customMessage,
      triggeredBy: userId
    });

    // Send emergency message in the conversation
    await MessagingService.sendEmergencyMessage(booking, userId, alertType);

    // Emit high-priority real-time notification
    const otherUserId = booking.passengerId === userId 
      ? booking.driverId 
      : booking.passengerId;

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${otherUserId}`).emit('emergency_alert', {
        type: 'emergency_alert',
        title: '🚨 Emergency Alert Sent',
        message: 'Emergency contacts have been notified',
        bookingId,
        priority: 'critical',
        requiresAcknowledgment: true
      });
    }

    sendResponse(res, 201, alertRecord, 'Emergency alert sent successfully');
  } catch (error) {
    logger.error('Error sending emergency contact alert:', error);
    sendError(res, 500, 'EMERGENCY_ALERT_FAILED', 'Failed to send emergency alert');
  }
});

/**
 * @route GET /api/messages/booking/:bookingId/communication-features
 * @desc Get available communication features for booking
 * @access Private
 */
router.get('/booking/:bookingId/communication-features', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.uid;

    // Get booking details
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    // Verify user is part of the booking
    if (booking.passengerId !== userId && booking.driverId !== userId) {
      return sendError(res, 403, 'UNAUTHORIZED', 'You are not authorized to view communication features for this booking');
    }

    // Get communication status
    const MessagingService = require('../services/messagingService');
    const [bookingCommStatus, tripCommStatus] = await Promise.all([
      MessagingService.getBookingCommunicationStatus(bookingId),
      MessagingService.getTripCommunicationStatus(bookingId)
    ]);

    // Get user's communication preferences
    const userPreferences = await MessagingService.getCommunicationPreferences(userId);

    // Determine available features based on booking status and preferences
    const availableFeatures = {
      messaging: bookingCommStatus.isEnabled && userPreferences.allowMessages,
      locationSharing: bookingCommStatus.isEnabled && userPreferences.allowLocationSharing,
      emergencyContact: bookingCommStatus.isEnabled && userPreferences.allowEmergencyContact,
      callsEnabled: bookingCommStatus.isEnabled && userPreferences.allowCalls,
      photoSharing: bookingCommStatus.isEnabled,
      contactInfoShared: booking.status === 'confirmed',
      tripSpecificChannel: !!tripCommStatus.isActive
    };

    const communicationFeatures = {
      bookingId,
      bookingStatus: booking.status,
      userRole: booking.passengerId === userId ? 'passenger' : 'driver',
      availableFeatures,
      bookingCommunication: bookingCommStatus,
      tripCommunication: tripCommStatus,
      userPreferences
    };

    sendResponse(res, 200, communicationFeatures, 'Communication features retrieved successfully');
  } catch (error) {
    logger.error('Error getting booking communication features:', error);
    sendError(res, 500, 'FEATURES_FETCH_FAILED', 'Failed to retrieve communication features');
  }
});

module.exports = router;