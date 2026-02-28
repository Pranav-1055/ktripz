const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { getDatabase, getAuth } = require('../config/firebase');
const MessagingService = require('../services/messagingService');
const { emitBookingStatusChange, emitUserNotification, emitRideUpdate } = require('../config/socket');
const router = express.Router();

// Helper function to get database instance
const getDB = () => getDatabase();

// Database will be initialized lazily when needed

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

// POST /api/bookings - Create new booking request
router.post('/', verifyToken, [
    body('rideId').notEmpty().withMessage('Ride ID is required'),
    body('seatsBooked').isInt({ min: 1, max: 8 }).withMessage('Seats booked must be between 1 and 8'),
    body('pickupPoint').optional().isString().withMessage('Pickup point must be a string'),
    body('dropoffPoint').optional().isString().withMessage('Drop-off point must be a string'),
    body('passengerNotes').optional().isString().withMessage('Passenger notes must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { rideId, seatsBooked, pickupPoint, dropoffPoint, passengerNotes } = req.body;

        // Check if ride exists and is available
        const rideRef = getDB().ref(`rides/${rideId}`);
        const rideSnapshot = await rideRef.once('value');

        if (!rideSnapshot.exists()) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const rideData = rideSnapshot.val();

        // Check if ride is published and has available seats
        if (rideData.status !== 'published') {
            return res.status(400).json({ error: 'Ride is not available for booking' });
        }

        if (rideData.availableSeats < seatsBooked) {
            return res.status(400).json({ error: 'Not enough seats available' });
        }

        // Check if user is not the driver
        if (rideData.driverId === req.user.uid) {
            return res.status(400).json({ error: 'You cannot book your own ride' });
        }

        // Check if user has already booked this ride
        const existingBookingsRef = getDB().ref('bookings');
        const existingQuery = existingBookingsRef
            .orderByChild('rideId')
            .equalTo(rideId);

        const existingSnapshot = await existingQuery.once('value');
        if (existingSnapshot.exists()) {
            const bookings = existingSnapshot.val();
            const userBooking = Object.values(bookings).find(
                booking => booking.passengerId === req.user.uid && 
                          ['requested', 'confirmed'].includes(booking.status)
            );

            if (userBooking) {
                return res.status(400).json({ error: 'You have already booked this ride' });
            }
        }

        const isInstantBooking = rideData.preferences?.instantBooking !== false;

        // Create booking data
        const bookingData = {
            rideId,
            passengerId: req.user.uid,
            driverId: rideData.driverId,
            seatsBooked: parseInt(seatsBooked),
            pickupPoint: pickupPoint || rideData.origin.city,
            dropoffPoint: dropoffPoint || rideData.destination.city,
            passengerNotes: passengerNotes || '',
            pricing: {
                pricePerSeat: rideData.pricePerSeat,
                totalAmount: rideData.pricePerSeat * seatsBooked,
                serviceFee: Math.round(rideData.pricePerSeat * seatsBooked * 0.05), // 5% service fee
                finalAmount: Math.round(rideData.pricePerSeat * seatsBooked * 1.05)
            },
            payment: {
                method: null,
                transactionId: null,
                status: 'pending'
            },
            status: isInstantBooking ? 'confirmed' : 'requested',
            requestedAt: new Date().toISOString(),
            confirmedAt: isInstantBooking ? new Date().toISOString() : null
        };

        // Save booking to Firebase
        const newBookingRef = getDB().ref('bookings').push();
        await newBookingRef.set(bookingData);

        // Update ride's available seats if instant booking
        if (isInstantBooking) {
            const updatedAvailableSeats = rideData.availableSeats - seatsBooked;
            await rideRef.update({
                availableSeats: updatedAvailableSeats,
                updatedAt: new Date().toISOString()
            });

            // Add passenger to ride's passenger list
            const passengerUpdate = {};
            passengerUpdate[`passengers/${req.user.uid}`] = {
                seatsBooked,
                status: 'confirmed',
                bookingTime: new Date().toISOString(),
                pickupPoint: pickupPoint || rideData.origin.city,
                dropoffPoint: dropoffPoint || rideData.destination.city
            };
            await rideRef.update(passengerUpdate);

            emitRideUpdate(rideId, { availableSeats: updatedAvailableSeats });
        }

        // Return created booking with ID
        const createdBooking = {
            id: newBookingRef.key,
            ...bookingData
        };

        // Initialize messaging conversation for the booking
        try {
            await MessagingService.initializeBookingConversation(createdBooking);
            
            // If instant booking, enable full communication features
            if (isInstantBooking) {
                await MessagingService.handleBookingLifecycleEvent(createdBooking, 'booking_confirmed');
                
                // Enable trip-specific communication channel
                await MessagingService.setupTripCommunicationChannel(createdBooking);
                
                // Share driver contact information
                await MessagingService.shareDriverContactInfo(createdBooking);
                
                // Enable emergency contact integration
                await MessagingService.enableEmergencyContactIntegration(createdBooking);
            }
        } catch (messagingError) {
            console.error('Error initializing booking conversation:', messagingError);
            // Don't fail the booking if messaging fails
        }

        // Emit real-time notifications
        try {
            // Notify driver about new booking request
            emitUserNotification(bookingData.driverId, {
                type: 'booking_request',
                title: 'New Booking Request',
                message: `You have a new booking request for ${seatsBooked} seat(s)`,
                bookingId: newBookingRef.key,
                rideId: bookingData.rideId
            });

            // If instant booking, notify passenger about confirmation
            if (isInstantBooking) {
                emitBookingStatusChange(newBookingRef.key, req.user.uid, {
                    status: 'confirmed',
                    message: 'Your booking has been confirmed automatically!'
                });
            }
        } catch (notificationError) {
            console.error('Error sending notifications:', notificationError);
        }

        res.status(201).json({
            success: true,
            data: createdBooking,
            message: isInstantBooking
                ? 'Booking confirmed successfully!' 
                : 'Booking request sent to driver'
        });

    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/bookings - Get user's bookings
router.get('/', verifyToken, [
    query('status').optional().isIn(['requested', 'confirmed', 'completed', 'cancelled']),
    query('role').optional().isIn(['passenger', 'driver']),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { status, role, limit = 20, offset = 0 } = req.query;

        let bookingsQuery;
        if (role === 'driver') {
            bookingsQuery = getDB().ref('bookings').orderByChild('driverId').equalTo(req.user.uid);
        } else {
            bookingsQuery = getDB().ref('bookings').orderByChild('passengerId').equalTo(req.user.uid);
        }

        const snapshot = await bookingsQuery.once('value');
        let bookings = [];

        if (snapshot.exists()) {
            const bookingsData = snapshot.val();
            bookings = Object.entries(bookingsData).map(([id, data]) => ({
                id,
                ...data
            }));

            // Filter by status if provided
            if (status) {
                bookings = bookings.filter(booking => booking.status === status);
            }

            // Sort by request date (newest first)
            bookings.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

            // Apply pagination
            bookings = bookings.slice(offset, offset + limit);

            // Fetch additional details for each booking
            for (let booking of bookings) {
                try {
                    // Fetch ride details
                    const rideRef = getDB().ref(`rides/${booking.rideId}`);
                    const rideSnapshot = await rideRef.once('value');
                    if (rideSnapshot.exists()) {
                        booking.ride = rideSnapshot.val();
                    }

                    // Fetch passenger details if user is driver
                    if (role === 'driver') {
                        const passengerRef = getDB().ref(`users/${booking.passengerId}`);
                        const passengerSnapshot = await passengerRef.once('value');
                        if (passengerSnapshot.exists()) {
                            const passengerData = passengerSnapshot.val();
                            booking.passenger = {
                                name: passengerData.fullName,
                                phone: passengerData.phone,
                                rating: passengerData.rating || 4.5,
                                memberSince: passengerData.createdAt
                            };
                        }
                    }

                    // Fetch driver details if user is passenger
                    if (role !== 'driver') {
                        const driverRef = getDB().ref(`users/${booking.driverId}`);
                        const driverSnapshot = await driverRef.once('value');
                        if (driverSnapshot.exists()) {
                            const driverData = driverSnapshot.val();
                            booking.driver = {
                                name: driverData.fullName,
                                phone: driverData.phone,
                                rating: driverData.rating || 4.5,
                                memberSince: driverData.createdAt
                            };
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching details for booking ${booking.id}:`, error);
                }
            }
        }

        res.json({
            success: true,
            data: {
                bookings,
                total: bookings.length,
                limit,
                offset
            }
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/bookings/:id - Get specific booking
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is involved in this booking
        if (bookingData.passengerId !== req.user.uid && bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const booking = { id, ...bookingData };

        // Fetch ride details
        try {
            const rideRef = getDB().ref(`rides/${booking.rideId}`);
            const rideSnapshot = await rideRef.once('value');
            if (rideSnapshot.exists()) {
                booking.ride = rideSnapshot.val();
            }
        } catch (error) {
            console.error('Error fetching ride details:', error);
        }

        res.json({
            success: true,
            data: booking
        });

    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/bookings/:id/approve - Approve booking request (driver only)
router.put('/:id/approve', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is the driver
        if (bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Only the driver can approve bookings' });
        }

        // Check if booking is in requested status
        if (bookingData.status !== 'requested') {
            return res.status(400).json({ error: 'Booking is not in requested status' });
        }

        // Check if ride still has available seats
        const rideRef = getDB().ref(`rides/${bookingData.rideId}`);
        const rideSnapshot = await rideRef.once('value');

        if (!rideSnapshot.exists()) {
            return res.status(404).json({ error: 'Associated ride not found' });
        }

        const rideData = rideSnapshot.val();

        if (rideData.availableSeats < bookingData.seatsBooked) {
            return res.status(400).json({ error: 'Not enough seats available' });
        }

        // Update booking status
        await bookingRef.update({
            status: 'confirmed',
            confirmedAt: new Date().toISOString()
        });

        // Update ride's available seats
        const updatedAvailableSeats = rideData.availableSeats - bookingData.seatsBooked;
        await rideRef.update({
            availableSeats: updatedAvailableSeats,
            updatedAt: new Date().toISOString()
        });

        // Add passenger to ride's passenger list
        const passengerUpdate = {};
        passengerUpdate[`passengers/${bookingData.passengerId}`] = {
            seatsBooked: bookingData.seatsBooked,
            status: 'confirmed',
            bookingTime: new Date().toISOString(),
            pickupPoint: bookingData.pickupPoint,
            dropoffPoint: bookingData.dropoffPoint
        };
        await rideRef.update(passengerUpdate);

        emitRideUpdate(bookingData.rideId, { availableSeats: updatedAvailableSeats });

        // Send booking confirmation message and enable communication
        try {
            const bookingWithId = { id, ...bookingData, status: 'confirmed' };
            
            // Handle booking confirmation lifecycle event
            await MessagingService.handleBookingLifecycleEvent(bookingWithId, 'booking_confirmed');
            
            // Enable trip-specific communication channel
            await MessagingService.setupTripCommunicationChannel(bookingWithId);
            
            // Share driver contact information with passenger
            await MessagingService.shareDriverContactInfo(bookingWithId);
            
            // Enable emergency contact integration for the trip
            await MessagingService.enableEmergencyContactIntegration(bookingWithId);
        } catch (messagingError) {
            console.error('Error setting up booking communication:', messagingError);
        }

        // Emit real-time notifications
        try {
            emitBookingStatusChange(id, bookingData.passengerId, {
                status: 'confirmed',
                message: 'Your booking has been approved by the driver!'
            });

            emitUserNotification(bookingData.passengerId, {
                type: 'booking_confirmed',
                title: 'Booking Confirmed',
                message: 'Your booking has been approved! You can now message the driver.',
                bookingId: id,
                rideId: bookingData.rideId
            });
        } catch (notificationError) {
            console.error('Error sending approval notifications:', notificationError);
        }

        res.json({
            success: true,
            message: 'Booking approved successfully'
        });

    } catch (error) {
        console.error('Error approving booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/bookings/:id/reject - Reject booking request (driver only)
router.put('/:id/reject', verifyToken, [
    body('reason').optional().isString().withMessage('Reason must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { reason } = req.body;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is the driver
        if (bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Only the driver can reject bookings' });
        }

        // Check if booking is in requested status
        if (bookingData.status !== 'requested') {
            return res.status(400).json({ error: 'Booking is not in requested status' });
        }

        // Update booking status
        await bookingRef.update({
            status: 'rejected',
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason || 'No reason provided'
        });

        // Send cancellation notification message
        try {
            const bookingWithId = { id, ...bookingData };
            await MessagingService.handleBookingLifecycleEvent(
                bookingWithId, 
                'booking_cancelled', 
                { 
                    cancelledBy: req.user.uid,
                    reason: reason || 'Booking request was declined'
                }
            );
        } catch (messagingError) {
            console.error('Error sending rejection message:', messagingError);
        }

        // Emit real-time notifications
        try {
            emitBookingStatusChange(id, bookingData.passengerId, {
                status: 'rejected',
                message: 'Your booking request has been declined.',
                reason: reason || 'No reason provided'
            });

            emitUserNotification(bookingData.passengerId, {
                type: 'booking_rejected',
                title: 'Booking Declined',
                message: 'Your booking request has been declined by the driver.',
                bookingId: id,
                rideId: bookingData.rideId
            });
        } catch (notificationError) {
            console.error('Error sending rejection notifications:', notificationError);
        }

        res.json({
            success: true,
            message: 'Booking rejected'
        });

    } catch (error) {
        console.error('Error rejecting booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/bookings/:id/cancel - Cancel booking
router.put('/:id/cancel', verifyToken, [
    body('reason').optional().isString().withMessage('Reason must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { reason } = req.body;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is involved in this booking
        if (bookingData.passengerId !== req.user.uid && bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if booking can be cancelled
        if (!['requested', 'confirmed'].includes(bookingData.status)) {
            return res.status(400).json({ error: 'Booking cannot be cancelled' });
        }

        const cancelledBy = bookingData.passengerId === req.user.uid ? 'passenger' : 'driver';

        // Update booking status
        await bookingRef.update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy,
            cancellationReason: reason || 'No reason provided'
        });

        // If booking was confirmed, restore seats to ride
        if (bookingData.status === 'confirmed') {
            const rideRef = getDB().ref(`rides/${bookingData.rideId}`);
            const rideSnapshot = await rideRef.once('value');

            if (rideSnapshot.exists()) {
                const rideData = rideSnapshot.val();
                const updatedAvailableSeats = rideData.availableSeats + bookingData.seatsBooked;
                await rideRef.update({
                    availableSeats: updatedAvailableSeats,
                    updatedAt: new Date().toISOString()
                });

                // Remove passenger from ride's passenger list
                await rideRef.child(`passengers/${bookingData.passengerId}`).remove();

                emitRideUpdate(bookingData.rideId, { availableSeats: updatedAvailableSeats });
            }
        }

        // Send cancellation notification message
        try {
            const bookingWithId = { id, ...bookingData };
            await MessagingService.handleBookingLifecycleEvent(
                bookingWithId, 
                'booking_cancelled', 
                { 
                    cancelledBy: req.user.uid,
                    reason: reason || 'Trip was cancelled'
                }
            );
        } catch (messagingError) {
            console.error('Error sending cancellation message:', messagingError);
        }

        // Emit real-time notifications
        try {
            const otherUserId = bookingData.passengerId === req.user.uid 
                ? bookingData.driverId 
                : bookingData.passengerId;

            emitBookingStatusChange(id, otherUserId, {
                status: 'cancelled',
                message: `Booking has been cancelled by ${cancelledBy}.`,
                reason: reason || 'No reason provided'
            });

            emitUserNotification(otherUserId, {
                type: 'booking_cancelled',
                title: 'Booking Cancelled',
                message: `The booking has been cancelled by the ${cancelledBy}.`,
                bookingId: id,
                rideId: bookingData.rideId
            });
        } catch (notificationError) {
            console.error('Error sending cancellation notifications:', notificationError);
        }

        res.json({
            success: true,
            message: 'Booking cancelled successfully'
        });

    } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/bookings/provider/requests - Get booking requests for provider
router.get('/provider/requests', verifyToken, [
    query('status').optional().isIn(['requested', 'confirmed', 'completed', 'cancelled', 'rejected']),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { status, limit = 20, offset = 0 } = req.query;

        // Get bookings where user is the driver
        const bookingsQuery = getDB().ref('bookings').orderByChild('driverId').equalTo(req.user.uid);
        const snapshot = await bookingsQuery.once('value');

        let bookings = [];

        if (snapshot.exists()) {
            const bookingsData = snapshot.val();
            bookings = Object.entries(bookingsData).map(([id, data]) => ({
                id,
                ...data
            }));

            // Filter by status if provided
            if (status) {
                bookings = bookings.filter(booking => booking.status === status);
            }

            // Sort by request date (newest first)
            bookings.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

            // Apply pagination
            bookings = bookings.slice(offset, offset + limit);

            // Fetch additional details for each booking
            for (let booking of bookings) {
                try {
                    // Fetch ride details
                    const rideRef = getDB().ref(`rides/${booking.rideId}`);
                    const rideSnapshot = await rideRef.once('value');
                    if (rideSnapshot.exists()) {
                        booking.ride = rideSnapshot.val();
                    }

                    // Fetch passenger details
                    const passengerRef = getDB().ref(`users/${booking.passengerId}`);
                    const passengerSnapshot = await passengerRef.once('value');
                    if (passengerSnapshot.exists()) {
                        const passengerData = passengerSnapshot.val();
                        booking.passenger = {
                            name: passengerData.fullName,
                            phone: passengerData.phone,
                            rating: passengerData.rating || 4.5,
                            memberSince: passengerData.createdAt,
                            verified: passengerData.emailVerified || false
                        };
                    }
                } catch (error) {
                    console.error(`Error fetching details for booking ${booking.id}:`, error);
                }
            }
        }

        res.json({
            success: true,
            data: {
                bookings,
                total: bookings.length,
                limit,
                offset
            }
        });

    } catch (error) {
        console.error('Error fetching provider booking requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/bookings/:id/emergency - Send emergency message
router.post('/:id/emergency', verifyToken, [
    body('emergencyType').isIn(['general', 'breakdown', 'accident', 'location', 'late']).withMessage('Invalid emergency type'),
    body('customMessage').optional().isString().withMessage('Custom message must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { emergencyType, customMessage } = req.body;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is involved in this booking
        if (bookingData.passengerId !== req.user.uid && bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if booking is active
        if (!['confirmed', 'in_progress'].includes(bookingData.status)) {
            return res.status(400).json({ error: 'Emergency messages can only be sent for active bookings' });
        }

        // Send emergency message
        try {
            const bookingWithId = { id, ...bookingData };
            let message;
            
            if (customMessage) {
                // Send custom emergency message
                const otherUserId = bookingData.passengerId === req.user.uid 
                    ? bookingData.driverId 
                    : bookingData.passengerId;
                
                const conversationId = `booking_${id}`;
                message = await MessagingService.sendCustomEmergencyMessage(
                    conversationId, 
                    req.user.uid, 
                    otherUserId, 
                    customMessage
                );
            } else {
                // Send predefined emergency message
                message = await MessagingService.sendEmergencyMessage(
                    bookingWithId, 
                    req.user.uid, 
                    emergencyType
                );
            }

            // Emit high-priority real-time notification
            const otherUserId = bookingData.passengerId === req.user.uid 
                ? bookingData.driverId 
                : bookingData.passengerId;

            emitUserNotification(otherUserId, {
                type: 'emergency_message',
                title: '🚨 Emergency Message',
                message: 'You have received an emergency message',
                bookingId: id,
                priority: 'high',
                requiresAcknowledgment: true
            });

            res.json({
                success: true,
                data: message,
                message: 'Emergency message sent successfully'
            });

        } catch (messagingError) {
            console.error('Error sending emergency message:', messagingError);
            res.status(500).json({ error: 'Failed to send emergency message' });
        }

    } catch (error) {
        console.error('Error handling emergency message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/bookings/:id/communication - Get communication details for booking
router.get('/:id/communication', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is involved in this booking
        if (bookingData.passengerId !== req.user.uid && bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get communication details
        const conversationId = `booking_${id}`;
        const otherUserId = bookingData.passengerId === req.user.uid 
            ? bookingData.driverId 
            : bookingData.passengerId;

        // Get other user's details
        const otherUserRef = getDB().ref(`users/${otherUserId}`);
        const otherUserSnapshot = await otherUserRef.once('value');
        const otherUserData = otherUserSnapshot.val();

        // Get conversation stats
        const conversationStats = await MessagingService.getMessagingStats(req.user.uid);

        // Get emergency contact info if booking is confirmed
        let emergencyContact = null;
        if (bookingData.status === 'confirmed') {
            emergencyContact = {
                name: otherUserData?.fullName || 'Unknown',
                phone: otherUserData?.phone || null,
                canCall: bookingData.status === 'confirmed',
                canMessage: true
            };
        }

        res.json({
            success: true,
            data: {
                conversationId,
                canCommunicate: ['confirmed', 'in_progress'].includes(bookingData.status),
                emergencyContact,
                conversationStats,
                communicationPreferences: {
                    allowCalls: otherUserData?.preferences?.allowCalls !== false,
                    allowMessages: otherUserData?.preferences?.allowMessages !== false,
                    responseTime: otherUserData?.stats?.averageResponseTime || 'Unknown'
                }
            }
        });

    } catch (error) {
        console.error('Error getting communication details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/bookings/:id/trip-status - Update trip status with communication
router.put('/:id/trip-status', verifyToken, [
    body('status').isIn(['started', 'in_progress', 'completed']).withMessage('Invalid trip status'),
    body('location').optional().isObject().withMessage('Location must be an object'),
    body('estimatedArrival').optional().isString().withMessage('Estimated arrival must be a string'),
    body('message').optional().isString().withMessage('Message must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { status, location, estimatedArrival, message } = req.body;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is the driver (only driver can update trip status)
        if (bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Only the driver can update trip status' });
        }

        // Update booking with trip status
        const updateData = {
            tripStatus: status,
            updatedAt: new Date().toISOString()
        };

        if (status === 'started') {
            updateData.tripStartedAt = new Date().toISOString();
        } else if (status === 'completed') {
            updateData.tripCompletedAt = new Date().toISOString();
            updateData.status = 'completed';
        }

        if (location) {
            updateData.currentLocation = location;
        }

        await bookingRef.update(updateData);

        // Send appropriate communication messages
        try {
            const bookingWithId = { id, ...bookingData, ...updateData };

            switch (status) {
                case 'started':
                    await MessagingService.handleBookingLifecycleEvent(
                        bookingWithId, 
                        'trip_started', 
                        { estimatedArrival }
                    );
                    break;
                case 'completed':
                    await MessagingService.handleBookingLifecycleEvent(
                        bookingWithId, 
                        'trip_completed'
                    );
                    break;
            }

            // Send custom message if provided
            if (message) {
                const conversationId = `booking_${id}`;
                await MessagingService.sendCustomMessage(
                    conversationId,
                    req.user.uid,
                    bookingData.passengerId,
                    message
                );
            }

        } catch (messagingError) {
            console.error('Error sending trip status messages:', messagingError);
        }

        // Emit real-time notifications
        try {
            emitBookingStatusChange(id, bookingData.passengerId, {
                tripStatus: status,
                message: `Trip ${status}`,
                location: location || null,
                estimatedArrival: estimatedArrival || null
            });

            emitUserNotification(bookingData.passengerId, {
                type: `trip_${status}`,
                title: `Trip ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                message: `Your trip has ${status}`,
                bookingId: id,
                rideId: bookingData.rideId
            });
        } catch (notificationError) {
            console.error('Error sending trip status notifications:', notificationError);
        }

        res.json({
            success: true,
            message: `Trip status updated to ${status}`
        });

    } catch (error) {
        console.error('Error updating trip status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/bookings/:id/share-location - Share current location
router.post('/:id/share-location', verifyToken, [
    body('latitude').isFloat().withMessage('Latitude must be a number'),
    body('longitude').isFloat().withMessage('Longitude must be a number'),
    body('address').optional().isString().withMessage('Address must be a string'),
    body('message').optional().isString().withMessage('Message must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { latitude, longitude, address, message } = req.body;

        const bookingRef = getDB().ref(`bookings/${id}`);
        const snapshot = await bookingRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = snapshot.val();

        // Check if user is involved in this booking
        if (bookingData.passengerId !== req.user.uid && bookingData.driverId !== req.user.uid) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if booking allows location sharing
        if (!['confirmed', 'in_progress'].includes(bookingData.status)) {
            return res.status(400).json({ error: 'Location sharing is only available for active bookings' });
        }

        // Send location message
        try {
            const conversationId = `booking_${id}`;
            const otherUserId = bookingData.passengerId === req.user.uid 
                ? bookingData.driverId 
                : bookingData.passengerId;

            const locationMessage = await MessagingService.sendLocationMessage(
                conversationId,
                req.user.uid,
                otherUserId,
                { latitude, longitude, address, message }
            );

            // Emit real-time notification
            emitUserNotification(otherUserId, {
                type: 'location_shared',
                title: 'Location Shared',
                message: 'Location has been shared with you',
                bookingId: id,
                location: { latitude, longitude, address }
            });

            res.json({
                success: true,
                data: locationMessage,
                message: 'Location shared successfully'
            });

        } catch (messagingError) {
            console.error('Error sharing location:', messagingError);
            res.status(500).json({ error: 'Failed to share location' });
        }

    } catch (error) {
        console.error('Error handling location sharing:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
