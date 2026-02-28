const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { getDatabase, getAuth } = require('../config/firebase');
const MessagingService = require('../services/messagingService');
const { emitUserNotification } = require('../config/socket');
const router = express.Router();

// Helper function to get database instance
const getDB = () => getDatabase();

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await getAuth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};

/**
 * @route GET /api/communication/preferences
 * @desc Get user's communication preferences
 * @access Private
 */
router.get('/preferences', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;

        // Get user's communication preferences from Firebase
        const preferencesRef = getDB().ref(`users/${userId}/communicationPreferences`);
        const snapshot = await preferencesRef.once('value');
        
        let preferences = snapshot.val();
        
        // If no preferences exist, initialize with defaults
        if (!preferences) {
            preferences = await MessagingService.initializeCommunicationPreferences(userId);
            await preferencesRef.set(preferences);
        }

        res.json({
            success: true,
            data: preferences
        });

    } catch (error) {
        console.error('Error getting communication preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route PUT /api/communication/preferences
 * @desc Update user's communication preferences
 * @access Private
 */
router.put('/preferences', verifyToken, [
    body('allowCalls').optional().isBoolean().withMessage('Allow calls must be a boolean'),
    body('allowMessages').optional().isBoolean().withMessage('Allow messages must be a boolean'),
    body('allowLocationSharing').optional().isBoolean().withMessage('Allow location sharing must be a boolean'),
    body('allowEmergencyContact').optional().isBoolean().withMessage('Allow emergency contact must be a boolean'),
    body('autoResponseEnabled').optional().isBoolean().withMessage('Auto response enabled must be a boolean'),
    body('autoResponseMessage').optional().isString().withMessage('Auto response message must be a string'),
    body('quietHours').optional().isObject().withMessage('Quiet hours must be an object')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.uid;
        const updates = req.body;

        // Get current preferences
        const preferencesRef = getDB().ref(`users/${userId}/communicationPreferences`);
        const snapshot = await preferencesRef.once('value');
        const currentPreferences = snapshot.val() || {};

        // Merge with updates
        const updatedPreferences = {
            ...currentPreferences,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Save to Firebase
        await preferencesRef.set(updatedPreferences);

        // Update in messaging service
        await MessagingService.updateCommunicationPreferences(userId, updatedPreferences);

        res.json({
            success: true,
            data: updatedPreferences,
            message: 'Communication preferences updated successfully'
        });

    } catch (error) {
        console.error('Error updating communication preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/communication/emergency-contacts
 * @desc Get user's emergency contacts
 * @access Private
 */
router.get('/emergency-contacts', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;

        // Get user's emergency contacts using MessagingService
        const contacts = await MessagingService.getEmergencyContacts(userId);

        res.json({
            success: true,
            data: contacts
        });

    } catch (error) {
        console.error('Error getting emergency contacts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/emergency-contacts
 * @desc Add emergency contact
 * @access Private
 */
router.post('/emergency-contacts', verifyToken, [
    body('name').notEmpty().withMessage('Name is required'),
    body('phone').notEmpty().withMessage('Phone is required'),
    body('relationship').notEmpty().withMessage('Relationship is required'),
    body('isPrimary').optional().isBoolean().withMessage('Is primary must be a boolean')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.uid;
        const contactData = req.body;

        // Add emergency contact using MessagingService
        const newContact = await MessagingService.addEmergencyContact(userId, contactData);

        res.json({
            success: true,
            data: newContact,
            message: 'Emergency contact added successfully'
        });

    } catch (error) {
        console.error('Error adding emergency contact:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route PUT /api/communication/emergency-contacts/:contactId
 * @desc Update emergency contact
 * @access Private
 */
router.put('/emergency-contacts/:contactId', verifyToken, [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().notEmpty().withMessage('Phone cannot be empty'),
    body('relationship').optional().notEmpty().withMessage('Relationship cannot be empty'),
    body('isPrimary').optional().isBoolean().withMessage('Is primary must be a boolean')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.uid;
        const { contactId } = req.params;
        const updates = req.body;

        // Update emergency contact using MessagingService
        const updatedContact = await MessagingService.updateEmergencyContact(userId, contactId, updates);

        res.json({
            success: true,
            data: updatedContact,
            message: 'Emergency contact updated successfully'
        });

    } catch (error) {
        if (error.message === 'Emergency contact not found') {
            return res.status(404).json({ error: 'Emergency contact not found' });
        }
        console.error('Error updating emergency contact:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route DELETE /api/communication/emergency-contacts/:contactId
 * @desc Remove emergency contact
 * @access Private
 */
router.delete('/emergency-contacts/:contactId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { contactId } = req.params;

        // Remove emergency contact using MessagingService
        await MessagingService.removeEmergencyContact(userId, contactId);

        res.json({
            success: true,
            message: 'Emergency contact removed successfully'
        });

    } catch (error) {
        console.error('Error removing emergency contact:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/auto-response
 * @desc Send auto-response message
 * @access Private
 */
router.post('/auto-response', verifyToken, [
    body('conversationId').notEmpty().withMessage('Conversation ID is required'),
    body('toUserId').notEmpty().withMessage('Recipient user ID is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.uid;
        const { conversationId, toUserId } = req.body;

        // Get user's auto-response settings
        const preferencesRef = getDB().ref(`users/${userId}/communicationPreferences`);
        const snapshot = await preferencesRef.once('value');
        const preferences = snapshot.val() || {};

        if (!preferences.autoResponseEnabled) {
            return res.status(400).json({ error: 'Auto-response is not enabled' });
        }

        // Check if we're in quiet hours
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
        
        if (preferences.quietHours?.enabled) {
            const { start, end } = preferences.quietHours;
            const isQuietTime = (currentTime >= start || currentTime <= end);
            
            if (isQuietTime) {
                return res.status(400).json({ error: 'Auto-response disabled during quiet hours' });
            }
        }

        // Send auto-response message
        const autoResponseMessage = preferences.autoResponseMessage || "I'll get back to you soon!";
        
        const message = await MessagingService.sendCustomMessage(
            conversationId,
            userId,
            toUserId,
            `🤖 Auto-reply: ${autoResponseMessage}`
        );

        res.json({
            success: true,
            data: message,
            message: 'Auto-response sent successfully'
        });

    } catch (error) {
        console.error('Error sending auto-response:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/communication/stats
 * @desc Get communication statistics for user
 * @access Private
 */
router.get('/stats', verifyToken, [
    query('dateRange').optional().isInt({ min: 1, max: 365 }).withMessage('Date range must be between 1 and 365 days')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.uid;
        const dateRange = parseInt(req.query.dateRange) || 30;

        // Get messaging statistics
        const stats = await MessagingService.getMessagingStats(userId, dateRange);

        res.json({
            success: true,
            data: {
                ...stats,
                dateRange,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error getting communication stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/test-emergency
 * @desc Test emergency communication system
 * @access Private
 */
router.post('/test-emergency', verifyToken, [
    body('contactId').optional().isString().withMessage('Contact ID must be a string'),
    body('message').optional().isString().withMessage('Message must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.uid;
        const { contactId, message = 'This is a test of the emergency communication system.' } = req.body;

        // Get user's emergency contacts
        const contactsRef = getDB().ref(`users/${userId}/emergencyContacts`);
        const snapshot = await contactsRef.once('value');
        const contacts = snapshot.val() || [];

        let targetContact;
        if (contactId) {
            targetContact = contacts.find(contact => contact.id === contactId);
        } else {
            targetContact = contacts.find(contact => contact.isPrimary) || contacts[0];
        }

        if (!targetContact) {
            return res.status(404).json({ error: 'No emergency contact found' });
        }

        // In a real implementation, this would send SMS/call to the emergency contact
        // For now, we'll just log it and return success
        console.log(`Emergency test message sent to ${targetContact.name} (${targetContact.phone}): ${message}`);

        res.json({
            success: true,
            data: {
                contact: targetContact,
                message,
                sentAt: new Date().toISOString()
            },
            message: 'Emergency communication test completed successfully'
        });

    } catch (error) {
        console.error('Error testing emergency communication:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/communication/booking/:bookingId/status
 * @desc Get booking communication status
 * @access Private
 */
router.get('/booking/:bookingId/status', verifyToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get booking communication status
        const status = await MessagingService.getBookingCommunicationStatus(bookingId);

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('Error getting booking communication status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/booking/:bookingId/lifecycle-event
 * @desc Handle booking lifecycle communication event
 * @access Private
 */
router.post('/booking/:bookingId/lifecycle-event', verifyToken, [
    body('event').isIn([
        'booking_confirmed', 'trip_starting_soon', 'driver_arrived', 
        'trip_started', 'trip_completed', 'booking_cancelled', 'payment_pending'
    ]).withMessage('Invalid lifecycle event'),
    body('eventData').optional().isObject().withMessage('Event data must be an object')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { bookingId } = req.params;
        const userId = req.user.uid;
        const { event, eventData = {} } = req.body;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Handle the lifecycle event
        const booking = { id: bookingId, ...bookingData };
        await MessagingService.handleBookingLifecycleEvent(booking, event, eventData);

        res.json({
            success: true,
            message: `Booking lifecycle event '${event}' handled successfully`
        });

    } catch (error) {
        console.error('Error handling booking lifecycle event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/check-permission
 * @desc Check if communication is allowed between users
 * @access Private
 */
router.post('/check-permission', verifyToken, [
    body('toUserId').notEmpty().withMessage('Target user ID is required'),
    body('communicationType').optional().isIn(['message', 'call', 'location', 'emergency']).withMessage('Invalid communication type')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const fromUserId = req.user.uid;
        const { toUserId, communicationType = 'message' } = req.body;

        // Check if communication is allowed
        const isAllowed = await MessagingService.isCommunicationAllowed(fromUserId, toUserId, communicationType);

        res.json({
            success: true,
            data: {
                isAllowed,
                fromUserId,
                toUserId,
                communicationType,
                checkedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error checking communication permission:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/communication/trip/:bookingId/status
 * @desc Get trip communication status
 * @access Private
 */
router.get('/trip/:bookingId/status', verifyToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get trip communication status
        const status = await MessagingService.getTripCommunicationStatus(bookingId);

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('Error getting trip communication status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/trip/:bookingId/emergency-alert
 * @desc Send emergency alert to emergency contacts
 * @access Private
 */
router.post('/trip/:bookingId/emergency-alert', verifyToken, [
    body('alertType').isIn(['trip_emergency', 'breakdown', 'accident', 'location_emergency']).withMessage('Invalid alert type'),
    body('alertPassengerContacts').optional().isBoolean().withMessage('Alert passenger contacts must be a boolean'),
    body('alertDriverContacts').optional().isBoolean().withMessage('Alert driver contacts must be a boolean'),
    body('customMessage').optional().isString().withMessage('Custom message must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { bookingId } = req.params;
        const userId = req.user.uid;
        const { alertType, alertPassengerContacts = true, alertDriverContacts = true, customMessage } = req.body;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if booking is active
        if (!['confirmed', 'in_progress'].includes(bookingData.status)) {
            return res.status(400).json({ error: 'Emergency alerts can only be sent for active bookings' });
        }

        // Send emergency alert
        const booking = { id: bookingId, ...bookingData };
        const alertRecord = await MessagingService.sendEmergencyAlert(booking, alertType, {
            alertPassengerContacts,
            alertDriverContacts,
            customMessage,
            triggeredBy: userId
        });

        // Send emergency message in the conversation
        try {
            await MessagingService.sendEmergencyMessage(booking, userId, alertType);
        } catch (messagingError) {
            console.error('Error sending emergency message:', messagingError);
        }

        // Emit high-priority real-time notification
        const otherUserId = bookingData.passengerId === userId 
            ? bookingData.driverId 
            : bookingData.passengerId;

        emitUserNotification(otherUserId, {
            type: 'emergency_alert',
            title: '🚨 Emergency Alert Sent',
            message: 'Emergency contacts have been notified',
            bookingId,
            priority: 'critical',
            requiresAcknowledgment: true
        });

        res.json({
            success: true,
            data: alertRecord,
            message: 'Emergency alert sent successfully'
        });

    } catch (error) {
        console.error('Error sending emergency alert:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route PUT /api/communication/trip/:bookingId/phase
 * @desc Update trip communication phase
 * @access Private
 */
router.put('/trip/:bookingId/phase', verifyToken, [
    body('phase').isIn(['pre_trip', 'in_progress', 'completed']).withMessage('Invalid trip phase')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { bookingId } = req.params;
        const userId = req.user.uid;
        const { phase } = req.body;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Update trip communication phase
        await MessagingService.updateTripCommunicationPhase(bookingId, phase);

        // Send appropriate template message based on phase
        const booking = { id: bookingId, ...bookingData };
        const conversationId = `booking_${bookingId}`;
        
        if (phase === 'in_progress') {
            await MessagingService.sendTripStartedNotification(booking);
        } else if (phase === 'completed') {
            await MessagingService.sendTripCompletedNotification(booking);
        }

        res.json({
            success: true,
            message: `Trip phase updated to ${phase}`
        });

    } catch (error) {
        console.error('Error updating trip phase:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/trip/:bookingId/enable-emergency
 * @desc Enable emergency contact integration for trip
 * @access Private
 */
router.post('/trip/:bookingId/enable-emergency', verifyToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Enable emergency contact integration
        const booking = { id: bookingId, ...bookingData };
        const emergencyData = await MessagingService.enableEmergencyContactIntegration(booking);

        res.json({
            success: true,
            data: emergencyData,
            message: 'Emergency contact integration enabled'
        });

    } catch (error) {
        console.error('Error enabling emergency contact integration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/booking/:bookingId/enable
 * @desc Enable communication features for confirmed booking
 * @access Private
 */
router.post('/booking/:bookingId/enable', verifyToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if booking is confirmed
        if (bookingData.status !== 'confirmed') {
            return res.status(400).json({ error: 'Communication can only be enabled for confirmed bookings' });
        }

        // Enable booking communication
        const booking = { id: bookingId, ...bookingData };
        const communicationSettings = await MessagingService.enableBookingCommunication(booking);

        res.json({
            success: true,
            data: communicationSettings,
            message: 'Communication features enabled for booking'
        });

    } catch (error) {
        console.error('Error enabling booking communication:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/booking/:bookingId/setup-trip-channel
 * @desc Setup trip-specific communication channel
 * @access Private
 */
router.post('/booking/:bookingId/setup-trip-channel', verifyToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if booking is confirmed
        if (bookingData.status !== 'confirmed') {
            return res.status(400).json({ error: 'Trip communication channel can only be setup for confirmed bookings' });
        }

        // Setup trip communication channel
        const booking = { id: bookingId, ...bookingData };
        const tripCommunicationData = await MessagingService.setupTripCommunicationChannel(booking);

        res.json({
            success: true,
            data: tripCommunicationData,
            message: 'Trip communication channel setup successfully'
        });

    } catch (error) {
        console.error('Error setting up trip communication channel:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/communication/booking/:bookingId/share-contact-info
 * @desc Share driver contact information with passenger
 * @access Private
 */
router.post('/booking/:bookingId/share-contact-info', verifyToken, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this booking
        const bookingRef = getDB().ref(`bookings/${bookingId}`);
        const bookingSnapshot = await bookingRef.once('value');
        
        if (!bookingSnapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = bookingSnapshot.val();
        if (bookingData.passengerId !== userId && bookingData.driverId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if booking is confirmed
        if (bookingData.status !== 'confirmed') {
            return res.status(400).json({ error: 'Contact information can only be shared for confirmed bookings' });
        }

        // Share driver contact information
        const booking = { id: bookingId, ...bookingData };
        const contactMessage = await MessagingService.shareDriverContactInfo(booking);

        res.json({
            success: true,
            data: contactMessage.toJSON(),
            message: 'Driver contact information shared successfully'
        });

    } catch (error) {
        console.error('Error sharing driver contact info:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
