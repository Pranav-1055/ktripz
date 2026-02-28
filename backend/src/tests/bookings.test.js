const request = require('supertest');
const app = require('../server');
const { initializeFirebase, getFirestore, getDatabase } = require('../config/firebase');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const User = require('../models/User');
const BookingService = require('../services/bookingService');

// Mock Firebase
jest.mock('../config/firebase');

// Mock Firebase Realtime Database
const mockRealtimeDb = {
    ref: jest.fn(() => ({
        push: jest.fn(() => ({
            key: 'mock-message-key',
            set: jest.fn()
        })),
        set: jest.fn()
    }))
};

getDatabase.mockReturnValue(mockRealtimeDb);

describe('Booking System', () => {
    let mockDb;
    let mockTransaction;
    let mockCollection;
    let mockDoc;
    let mockAuth;
    let testUser;
    let testRide;
    let testBooking;

    beforeAll(async () => {
        // Setup mock Firebase
        mockDoc = {
            get: jest.fn(),
            set: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            id: 'mock-doc-id'
        };

        mockCollection = {
            doc: jest.fn(() => mockDoc),
            where: jest.fn(() => mockCollection),
            orderBy: jest.fn(() => mockCollection),
            limit: jest.fn(() => mockCollection),
            get: jest.fn()
        };

        mockTransaction = {
            get: jest.fn(),
            set: jest.fn(),
            update: jest.fn()
        };

        mockDb = {
            collection: jest.fn(() => mockCollection),
            runTransaction: jest.fn()
        };

        mockAuth = {
            verifyIdToken: jest.fn()
        };

        getFirestore.mockReturnValue(mockDb);
        initializeFirebase.mockResolvedValue(true);

        // Setup test data
        testUser = {
            uid: 'test-user-123',
            email: 'test@example.com',
            displayName: 'Test User',
            role: 'passenger'
        };

        testRide = {
            id: 'test-ride-123',
            driverId: 'driver-123',
            origin: { city: 'Mumbai', address: 'Bandra', coordinates: { lat: 19.0596, lng: 72.8295 } },
            destination: { city: 'Pune', address: 'Koregaon Park', coordinates: { lat: 18.5204, lng: 73.8567 } },
            departureDate: '2026-12-25', // Future date
            departureTime: '10:00',
            arrivalTime: '13:00',
            pricePerSeat: 500,
            totalSeats: 4,
            availableSeats: 3,
            status: 'published',
            bookingPolicy: { instantBooking: false },
            passengers: {}
        };

        testBooking = {
            id: 'test-booking-123',
            rideId: 'test-ride-123',
            passengerId: 'test-user-123',
            driverId: 'driver-123',
            seatsBooked: 2,
            status: 'requested',
            pricing: {
                pricePerSeat: 500,
                totalAmount: 1000,
                serviceFee: 50,
                finalAmount: 1050
            }
        };
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock implementations
        mockAuth.verifyIdToken.mockResolvedValue(testUser);
        mockDoc.get.mockResolvedValue({ exists: true, data: () => testRide });
        mockCollection.get.mockResolvedValue({
            empty: false,
            docs: [{ data: () => testBooking }],
            forEach: (callback) => callback({ data: () => testBooking })
        });
    });

    describe('Booking Model', () => {
        test('should create booking instance with correct properties', () => {
            const booking = new Booking(testBooking);

            expect(booking.id).toBe(testBooking.id);
            expect(booking.rideId).toBe(testBooking.rideId);
            expect(booking.passengerId).toBe(testBooking.passengerId);
            expect(booking.seatsBooked).toBe(testBooking.seatsBooked);
            expect(booking.status).toBe(testBooking.status);
        });

        test('should save booking to Firestore', async () => {
            const booking = new Booking(testBooking);
            mockDoc.get.mockResolvedValue({ exists: true });
            mockDoc.set.mockResolvedValue();

            await booking.save();

            expect(mockDb.collection).toHaveBeenCalledWith('bookings');
            expect(mockDoc.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: testBooking.id,
                    rideId: testBooking.rideId,
                    passengerId: testBooking.passengerId,
                    seatsBooked: testBooking.seatsBooked
                }),
                { merge: true }
            );
        });

        test('should create booking with transaction', async () => {
            mockDb.runTransaction.mockImplementation(async (callback) => {
                const transaction = mockTransaction;
                transaction.get.mockResolvedValue({ exists: true, data: () => testRide });
                return await callback(transaction);
            });

            const bookingData = {
                rideId: 'test-ride-123',
                passengerId: 'test-user-123',
                seatsBooked: 2
            };

            const booking = await Booking.createWithTransaction(bookingData);

            expect(mockDb.runTransaction).toHaveBeenCalled();
            expect(booking).toBeInstanceOf(Booking);
        });

        test('should find booking by ID', async () => {
            mockDoc.get.mockResolvedValue({ exists: true, data: () => testBooking });

            const booking = await Booking.findById('test-booking-123');

            expect(booking).toBeInstanceOf(Booking);
            expect(booking.id).toBe(testBooking.id);
            expect(mockDb.collection).toHaveBeenCalledWith('bookings');
            expect(mockCollection.doc).toHaveBeenCalledWith('test-booking-123');
        });

        test('should return null for non-existent booking', async () => {
            mockDoc.get.mockResolvedValue({ exists: false });

            const booking = await Booking.findById('non-existent');

            expect(booking).toBeNull();
        });

        test('should find bookings by passenger ID', async () => {
            const bookings = await Booking.findByPassengerId('test-user-123');

            expect(Array.isArray(bookings)).toBe(true);
            expect(mockCollection.where).toHaveBeenCalledWith('passengerId', '==', 'test-user-123');
            expect(mockCollection.orderBy).toHaveBeenCalledWith('requestedAt', 'desc');
        });

        test('should update booking status with transaction', async () => {
            const booking = new Booking(testBooking);

            mockDb.runTransaction.mockImplementation(async (callback) => {
                const transaction = mockTransaction;
                transaction.get.mockResolvedValueOnce({ exists: true, data: () => testBooking });
                transaction.get.mockResolvedValueOnce({ exists: true, data: () => testRide });
                return await callback(transaction);
            });

            await booking.updateStatus('confirmed');

            expect(mockDb.runTransaction).toHaveBeenCalled();
        });

        test('should validate status transitions', async () => {
            const booking = new Booking({ ...testBooking, status: 'completed' });

            mockDb.runTransaction.mockImplementation(async (callback) => {
                const transaction = mockTransaction;
                transaction.get.mockResolvedValueOnce({ exists: true, data: () => ({ ...testBooking, status: 'completed' }) });
                return await callback(transaction);
            });

            await expect(booking.updateStatus('confirmed')).rejects.toThrow('Invalid status transition');
        });
    });

    describe('Booking Service', () => {
        test('should create booking successfully', async () => {
            const mockRide = new Ride(testRide);
            const mockUser = new User(testUser);

            jest.spyOn(Ride, 'findById').mockResolvedValue(mockRide);
            jest.spyOn(User, 'findByUid').mockResolvedValue(mockUser);
            jest.spyOn(Booking, 'findByRideId').mockResolvedValue([]);
            jest.spyOn(Booking, 'createWithTransaction').mockResolvedValue(new Booking(testBooking));

            const booking = await BookingService.createBooking({
                rideId: 'test-ride-123',
                seatsBooked: 2
            }, 'test-user-123');

            expect(booking).toBeInstanceOf(Booking);
            expect(Ride.findById).toHaveBeenCalledWith('test-ride-123');
            expect(Booking.createWithTransaction).toHaveBeenCalled();
        });

        test('should prevent booking own ride', async () => {
            const mockRide = new Ride({ ...testRide, driverId: 'test-user-123' });
            jest.spyOn(Ride, 'findById').mockResolvedValue(mockRide);

            await expect(BookingService.createBooking({
                rideId: 'test-ride-123',
                seatsBooked: 2
            }, 'test-user-123')).rejects.toThrow('Cannot book your own ride');
        });

        test('should prevent duplicate bookings', async () => {
            const mockRide = new Ride(testRide);
            const existingBooking = new Booking({ ...testBooking, status: 'confirmed' });

            jest.spyOn(Ride, 'findById').mockResolvedValue(mockRide);
            jest.spyOn(Booking, 'findByRideId').mockResolvedValue([existingBooking]);

            await expect(BookingService.createBooking({
                rideId: 'test-ride-123',
                seatsBooked: 2
            }, 'test-user-123')).rejects.toThrow('You already have an active booking for this ride');
        });

        test('should approve booking successfully', async () => {
            const mockBooking = new Booking(testBooking);
            jest.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
            jest.spyOn(mockBooking, 'updateStatus').mockResolvedValue(mockBooking);
            jest.spyOn(User, 'findByUid').mockResolvedValue(new User(testUser));

            const result = await BookingService.approveBooking('test-booking-123', 'driver-123');

            expect(result).toBeInstanceOf(Booking);
            expect(mockBooking.updateStatus).toHaveBeenCalledWith('confirmed');
        });

        test('should reject booking with reason', async () => {
            const mockBooking = new Booking(testBooking);
            jest.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
            jest.spyOn(mockBooking, 'updateStatus').mockResolvedValue(mockBooking);

            const result = await BookingService.rejectBooking('test-booking-123', 'driver-123', 'Vehicle issue');

            expect(result).toBeInstanceOf(Booking);
            expect(mockBooking.updateStatus).toHaveBeenCalledWith('cancelled_by_driver', 'Vehicle issue');
        });

        test('should cancel booking by passenger', async () => {
            const mockBooking = new Booking(testBooking);
            jest.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
            jest.spyOn(mockBooking, 'updateStatus').mockResolvedValue(mockBooking);
            jest.spyOn(mockBooking, 'canBeCancelled').mockReturnValue(true);
            jest.spyOn(Ride, 'findById').mockResolvedValue(new Ride(testRide));

            const result = await BookingService.cancelBooking('test-booking-123', 'test-user-123', 'Change of plans');

            expect(result).toBeInstanceOf(Booking);
            expect(mockBooking.updateStatus).toHaveBeenCalledWith('cancelled_by_passenger', 'Change of plans');
        });

        test('should complete booking', async () => {
            const mockBooking = new Booking({ ...testBooking, status: 'confirmed' });
            jest.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
            jest.spyOn(mockBooking, 'updateStatus').mockResolvedValue(mockBooking);

            const result = await BookingService.completeBooking('test-booking-123', 'driver-123');

            expect(result).toBeInstanceOf(Booking);
            expect(mockBooking.updateStatus).toHaveBeenCalledWith('completed');
        });

        test('should get user bookings', async () => {
            const mockBookings = [new Booking(testBooking)];
            jest.spyOn(Booking, 'findByPassengerId').mockResolvedValue(mockBookings);
            jest.spyOn(Ride, 'findById').mockResolvedValue(new Ride(testRide));

            const result = await BookingService.getUserBookings('test-user-123', 'passenger');

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
            expect(result[0]).toHaveProperty('booking');
            expect(result[0]).toHaveProperty('ride');
        });

        test('should add booking message', async () => {
            const mockBooking = new Booking(testBooking);
            const mockMessage = { from: 'test-user-123', to: 'driver-123', message: 'Hello', timestamp: new Date() };

            jest.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
            jest.spyOn(mockBooking, 'addMessage').mockResolvedValue(mockMessage);

            const result = await BookingService.addBookingMessage('test-booking-123', 'test-user-123', 'Hello');

            expect(result).toEqual(mockMessage);
            expect(mockBooking.addMessage).toHaveBeenCalledWith('test-user-123', 'driver-123', 'Hello', 'text');
        });

        test('should get booking statistics', async () => {
            const mockBookings = [
                new Booking({ ...testBooking, status: 'completed', pricing: { finalAmount: 1050 } }),
                new Booking({ ...testBooking, id: 'booking-2', status: 'cancelled_by_passenger' })
            ];

            jest.spyOn(Booking, 'findByPassengerId').mockResolvedValue(mockBookings);

            const stats = await BookingService.getBookingStats('test-user-123', 'passenger');

            expect(stats).toHaveProperty('total', 2);
            expect(stats).toHaveProperty('completed', 1);
            expect(stats).toHaveProperty('cancelled', 1);
            expect(stats).toHaveProperty('totalSpent', 1050);
        });
    });

    describe('Booking API Endpoints', () => {
        const mockToken = 'mock-jwt-token';

        beforeEach(() => {
            mockAuth.verifyIdToken.mockResolvedValue(testUser);
        });

        test('POST /api/bookings - should create booking', async () => {
            jest.spyOn(BookingService, 'createBooking').mockResolvedValue(new Booking(testBooking));

            const response = await request(app)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${mockToken}`)
                .send({
                    rideId: 'test-ride-123',
                    seatsBooked: 2
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('booking');
        });

        test('POST /api/bookings - should validate required fields', async () => {
            const response = await request(app)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${mockToken}`)
                .send({
                    seatsBooked: 2
                    // Missing rideId
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        test('GET /api/bookings/:bookingId - should get booking details', async () => {
            const mockBookingDetails = {
                booking: testBooking,
                ride: testRide,
                passenger: testUser,
                driver: { uid: 'driver-123', displayName: 'Driver User' }
            };

            jest.spyOn(BookingService, 'getBookingDetails').mockResolvedValue(mockBookingDetails);

            const response = await request(app)
                .get('/api/bookings/test-booking-123')
                .set('Authorization', `Bearer ${mockToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockBookingDetails);
        });

        test('PUT /api/bookings/:bookingId/status - should update booking status', async () => {
            jest.spyOn(BookingService, 'approveBooking').mockResolvedValue(new Booking({ ...testBooking, status: 'confirmed' }));

            const response = await request(app)
                .put('/api/bookings/test-booking-123/status')
                .set('Authorization', `Bearer ${mockToken}`)
                .send({
                    status: 'confirmed'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.booking.status).toBe('confirmed');
        });

        test('DELETE /api/bookings/:bookingId - should cancel booking', async () => {
            jest.spyOn(BookingService, 'cancelBooking').mockResolvedValue(new Booking({ ...testBooking, status: 'cancelled_by_passenger' }));

            const response = await request(app)
                .delete('/api/bookings/test-booking-123')
                .set('Authorization', `Bearer ${mockToken}`)
                .send({
                    reason: 'Change of plans'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.booking.status).toBe('cancelled_by_passenger');
        });

        test('GET /api/bookings - should get user bookings', async () => {
            const mockBookings = [{ booking: testBooking, ride: testRide }];
            jest.spyOn(BookingService, 'getUserBookings').mockResolvedValue(mockBookings);

            const response = await request(app)
                .get('/api/bookings?role=passenger')
                .set('Authorization', `Bearer ${mockToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.bookings).toEqual(mockBookings);
        });

        test('POST /api/bookings/:bookingId/messages - should add message', async () => {
            const mockMessage = { from: 'test-user-123', message: 'Hello', timestamp: new Date() };
            jest.spyOn(BookingService, 'addBookingMessage').mockResolvedValue(mockMessage);

            const response = await request(app)
                .post('/api/bookings/test-booking-123/messages')
                .set('Authorization', `Bearer ${mockToken}`)
                .send({
                    message: 'Hello',
                    type: 'text'
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.message).toEqual(mockMessage);
        });

        test('GET /api/bookings/:bookingId/messages - should get messages', async () => {
            const mockMessages = [
                { from: 'test-user-123', message: 'Hello', timestamp: new Date() },
                { from: 'driver-123', message: 'Hi there', timestamp: new Date() }
            ];

            jest.spyOn(BookingService, 'getBookingMessages').mockResolvedValue(mockMessages);

            const response = await request(app)
                .get('/api/bookings/test-booking-123/messages')
                .set('Authorization', `Bearer ${mockToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.messages).toEqual(mockMessages);
        });

        test('GET /api/bookings/stats/:role - should get booking statistics', async () => {
            const mockStats = {
                total: 5,
                completed: 3,
                cancelled: 1,
                totalSpent: 2500
            };

            jest.spyOn(BookingService, 'getBookingStats').mockResolvedValue(mockStats);

            const response = await request(app)
                .get('/api/bookings/stats/passenger')
                .set('Authorization', `Bearer ${mockToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.stats).toEqual(mockStats);
        });

        test('should require authentication for all endpoints', async () => {
            const endpoints = [
                { method: 'post', path: '/api/bookings' },
                { method: 'get', path: '/api/bookings/test-id' },
                { method: 'put', path: '/api/bookings/test-id/status' },
                { method: 'delete', path: '/api/bookings/test-id' },
                { method: 'get', path: '/api/bookings' }
            ];

            for (const endpoint of endpoints) {
                const response = await request(app)[endpoint.method](endpoint.path);
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle booking not found', async () => {
            jest.spyOn(Booking, 'findById').mockResolvedValue(null);

            await expect(BookingService.getBookingDetails('non-existent', 'user-123'))
                .rejects.toThrow('Booking not found');
        });

        test('should handle access denied', async () => {
            const mockBooking = new Booking({ ...testBooking, passengerId: 'other-user' });
            jest.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

            await expect(BookingService.getBookingDetails('test-booking-123', 'user-123'))
                .rejects.toThrow('Access denied');
        });

        test('should handle invalid seat count', async () => {
            await expect(BookingService.createBooking({
                rideId: 'test-ride-123',
                seatsBooked: 0
            }, 'user-123')).rejects.toThrow('Invalid number of seats');
        });

        test('should handle ride not found', async () => {
            jest.spyOn(Ride, 'findById').mockResolvedValue(null);

            await expect(BookingService.createBooking({
                rideId: 'non-existent',
                seatsBooked: 2
            }, 'user-123')).rejects.toThrow('Ride not found');
        });
    });
});