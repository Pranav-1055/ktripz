const UserService = require('../services/userService');
const RideService = require('../services/rideService');
const BookingService = require('../services/bookingService');
const PaymentService = require('../services/paymentService');
const SearchService = require('../services/searchService');
const NotificationService = require('../services/notificationService');
const VehicleService = require('../services/vehicleService');

// Mock models
jest.mock('../models/User');
jest.mock('../models/Ride');
jest.mock('../models/Booking');
jest.mock('../models/Payment');
jest.mock('../models/Vehicle');
jest.mock('../models/Review');

// Mock external services
jest.mock('../config/firebase');
jest.mock('../config/redis');

describe('Service Layer Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UserService', () => {
    describe('createUser', () => {
      test('should create user successfully', async () => {
        const userData = {
          firebaseUid: 'test-uid',
          profile: {
            name: 'Test User',
            email: 'test@example.com',
            role: 'passenger'
          }
        };

        const mockUser = {
          _id: 'user-123',
          ...userData,
          save: jest.fn().mockResolvedValue(true)
        };

        const User = require('../models/User');
        User.mockImplementation(() => mockUser);

        const result = await UserService.createUser(userData);

        expect(result).toBeDefined();
        expect(mockUser.save).toHaveBeenCalled();
      });

      test('should handle duplicate user creation', async () => {
        const userData = {
          firebaseUid: 'duplicate-uid',
          profile: {
            name: 'Test User',
            email: 'test@example.com',
            role: 'passenger'
          }
        };

        const User = require('../models/User');
        User.mockImplementation(() => ({
          save: jest.fn().mockRejectedValue(new Error('Duplicate key error'))
        }));

        await expect(UserService.createUser(userData)).rejects.toThrow();
      });
    });

    describe('updateUserProfile', () => {
      test('should update user profile successfully', async () => {
        const userId = 'user-123';
        const updateData = {
          name: 'Updated Name',
          bio: 'Updated bio'
        };

        const mockUser = {
          _id: userId,
          profile: { name: 'Old Name', bio: 'Old bio' },
          save: jest.fn().mockResolvedValue(true)
        };

        const User = require('../models/User');
        User.findById = jest.fn().mockResolvedValue(mockUser);

        const result = await UserService.updateUserProfile(userId, updateData);

        expect(result).toBeDefined();
        expect(mockUser.profile.name).toBe('Updated Name');
        expect(mockUser.save).toHaveBeenCalled();
      });

      test('should handle non-existent user', async () => {
        const User = require('../models/User');
        User.findById = jest.fn().mockResolvedValue(null);

        await expect(UserService.updateUserProfile('non-existent', {}))
          .rejects.toThrow('User not found');
      });
    });

    describe('getUserRating', () => {
      test('should calculate user rating correctly', async () => {
        const userId = 'user-123';
        const mockUser = {
          _id: userId,
          rating: {
            asPassenger: { average: 4.5, count: 10 },
            asDriver: { average: 4.8, count: 5 }
          }
        };

        const User = require('../models/User');
        User.findById = jest.fn().mockResolvedValue(mockUser);

        const result = await UserService.getUserRating(userId);

        expect(result.asPassenger.average).toBe(4.5);
        expect(result.asDriver.average).toBe(4.8);
      });
    });
  });

  describe('RideService', () => {
    describe('createRide', () => {
      test('should create ride successfully', async () => {
        const rideData = {
          driverId: 'driver-123',
          origin: {
            city: 'Mumbai',
            coordinates: { lat: 19.0596, lng: 72.8295 }
          },
          destination: {
            city: 'Pune',
            coordinates: { lat: 18.5204, lng: 73.8567 }
          },
          departureDate: '2024-12-31',
          departureTime: '10:00',
          pricePerSeat: 500,
          totalSeats: 4
        };

        const mockRide = {
          _id: 'ride-123',
          ...rideData,
          availableSeats: 4,
          status: 'published',
          save: jest.fn().mockResolvedValue(true)
        };

        const Ride = require('../models/Ride');
        Ride.mockImplementation(() => mockRide);

        const result = await RideService.createRide(rideData);

        expect(result).toBeDefined();
        expect(result.availableSeats).toBe(4);
        expect(mockRide.save).toHaveBeenCalled();
      });

      test('should validate ride data', async () => {
        const invalidRideData = {
          driverId: 'driver-123',
          // Missing required fields
          pricePerSeat: -100 // Invalid price
        };

        await expect(RideService.createRide(invalidRideData))
          .rejects.toThrow('Invalid ride data');
      });
    });

    describe('searchRides', () => {
      test('should search rides with filters', async () => {
        const searchParams = {
          origin: 'Mumbai',
          destination: 'Pune',
          date: '2024-12-31',
          passengers: 2
        };

        const mockRides = [
          {
            _id: 'ride-1',
            origin: { city: 'Mumbai' },
            destination: { city: 'Pune' },
            availableSeats: 3,
            pricePerSeat: 500
          },
          {
            _id: 'ride-2',
            origin: { city: 'Mumbai' },
            destination: { city: 'Pune' },
            availableSeats: 4,
            pricePerSeat: 450
          }
        ];

        const Ride = require('../models/Ride');
        Ride.find = jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                skip: jest.fn().mockResolvedValue(mockRides)
              })
            })
          })
        });

        const result = await RideService.searchRides(searchParams);

        expect(result.rides).toHaveLength(2);
        expect(result.rides[0].pricePerSeat).toBe(500);
      });

      test('should handle empty search results', async () => {
        const Ride = require('../models/Ride');
        Ride.find = jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                skip: jest.fn().mockResolvedValue([])
              })
            })
          })
        });

        const result = await RideService.searchRides({
          origin: 'NonExistent',
          destination: 'City'
        });

        expect(result.rides).toHaveLength(0);
        expect(result.total).toBe(0);
      });
    });

    describe('updateRideAvailability', () => {
      test('should update available seats correctly', async () => {
        const rideId = 'ride-123';
        const seatsToBook = 2;

        const mockRide = {
          _id: rideId,
          availableSeats: 4,
          save: jest.fn().mockResolvedValue(true)
        };

        const Ride = require('../models/Ride');
        Ride.findById = jest.fn().mockResolvedValue(mockRide);

        const result = await RideService.updateRideAvailability(rideId, seatsToBook);

        expect(result.availableSeats).toBe(2);
        expect(mockRide.save).toHaveBeenCalled();
      });

      test('should handle insufficient seats', async () => {
        const mockRide = {
          _id: 'ride-123',
          availableSeats: 1
        };

        const Ride = require('../models/Ride');
        Ride.findById = jest.fn().mockResolvedValue(mockRide);

        await expect(RideService.updateRideAvailability('ride-123', 2))
          .rejects.toThrow('Insufficient seats available');
      });
    });
  });

  describe('BookingService', () => {
    describe('createBooking', () => {
      test('should create booking successfully', async () => {
        const bookingData = {
          rideId: 'ride-123',
          passengerId: 'passenger-123',
          seatsBooked: 2,
          pickupPoint: {
            name: 'Station',
            coordinates: { lat: 19.0596, lng: 72.8295 }
          }
        };

        const mockRide = {
          _id: 'ride-123',
          driverId: 'driver-123',
          availableSeats: 4,
          pricePerSeat: 500
        };

        const mockBooking = {
          _id: 'booking-123',
          ...bookingData,
          driverId: 'driver-123',
          pricing: {
            pricePerSeat: 500,
            totalAmount: 1000,
            finalAmount: 1050
          },
          save: jest.fn().mockResolvedValue(true)
        };

        const Ride = require('../models/Ride');
        const Booking = require('../models/Booking');
        
        Ride.findById = jest.fn().mockResolvedValue(mockRide);
        Booking.mockImplementation(() => mockBooking);

        const result = await BookingService.createBooking(bookingData);

        expect(result).toBeDefined();
        expect(result.seatsBooked).toBe(2);
        expect(result.pricing.totalAmount).toBe(1000);
        expect(mockBooking.save).toHaveBeenCalled();
      });

      test('should prevent self-booking', async () => {
        const bookingData = {
          rideId: 'ride-123',
          passengerId: 'driver-123', // Same as driver
          seatsBooked: 1
        };

        const mockRide = {
          _id: 'ride-123',
          driverId: 'driver-123'
        };

        const Ride = require('../models/Ride');
        Ride.findById = jest.fn().mockResolvedValue(mockRide);

        await expect(BookingService.createBooking(bookingData))
          .rejects.toThrow('Cannot book your own ride');
      });
    });

    describe('cancelBooking', () => {
      test('should cancel booking successfully', async () => {
        const bookingId = 'booking-123';
        const userId = 'passenger-123';

        const mockBooking = {
          _id: bookingId,
          passengerId: userId,
          status: 'confirmed',
          seatsBooked: 2,
          rideId: 'ride-123',
          save: jest.fn().mockResolvedValue(true)
        };

        const mockRide = {
          _id: 'ride-123',
          availableSeats: 2,
          save: jest.fn().mockResolvedValue(true)
        };

        const Booking = require('../models/Booking');
        const Ride = require('../models/Ride');
        
        Booking.findById = jest.fn().mockResolvedValue(mockBooking);
        Ride.findById = jest.fn().mockResolvedValue(mockRide);

        const result = await BookingService.cancelBooking(bookingId, userId);

        expect(result.status).toBe('cancelled');
        expect(mockRide.availableSeats).toBe(4); // Seats returned
        expect(mockBooking.save).toHaveBeenCalled();
        expect(mockRide.save).toHaveBeenCalled();
      });

      test('should handle unauthorized cancellation', async () => {
        const mockBooking = {
          _id: 'booking-123',
          passengerId: 'other-user',
          status: 'confirmed'
        };

        const Booking = require('../models/Booking');
        Booking.findById = jest.fn().mockResolvedValue(mockBooking);

        await expect(BookingService.cancelBooking('booking-123', 'unauthorized-user'))
          .rejects.toThrow('Unauthorized to cancel this booking');
      });
    });
  });

  describe('PaymentService', () => {
    describe('calculateTotalAmount', () => {
      test('should calculate total with service fee', () => {
        const baseAmount = 1000;
        const serviceFeePercentage = 5;

        const result = PaymentService.calculateTotalAmount(baseAmount, serviceFeePercentage);

        expect(result.baseAmount).toBe(1000);
        expect(result.serviceFee).toBe(50);
        expect(result.totalAmount).toBe(1050);
      });

      test('should use default service fee', () => {
        const result = PaymentService.calculateTotalAmount(1000);

        expect(result.baseAmount).toBe(1000);
        expect(result.serviceFee).toBeGreaterThan(0);
        expect(result.totalAmount).toBeGreaterThan(1000);
      });
    });

    describe('calculateRefundAmount', () => {
      test('should calculate full refund for early cancellation', () => {
        const amount = 1000;
        const hoursBeforeDeparture = 25; // More than 24 hours

        const result = PaymentService.calculateRefundAmount(amount, hoursBeforeDeparture);

        expect(result.refundAmount).toBe(1000);
        expect(result.refundPercentage).toBe(100);
        expect(result.refundType).toBe('full');
      });

      test('should calculate partial refund for late cancellation', () => {
        const amount = 1000;
        const hoursBeforeDeparture = 5; // Between 2-24 hours

        const result = PaymentService.calculateRefundAmount(amount, hoursBeforeDeparture);

        expect(result.refundAmount).toBe(500);
        expect(result.refundPercentage).toBe(50);
        expect(result.refundType).toBe('partial');
      });

      test('should calculate no refund for very late cancellation', () => {
        const amount = 1000;
        const hoursBeforeDeparture = 1; // Less than 2 hours

        const result = PaymentService.calculateRefundAmount(amount, hoursBeforeDeparture);

        expect(result.refundAmount).toBe(0);
        expect(result.refundPercentage).toBe(0);
        expect(result.refundType).toBe('none');
      });
    });

    describe('verifyRazorpayPayment', () => {
      test('should verify valid Razorpay signature', () => {
        const orderId = 'order_test123';
        const paymentId = 'pay_test123';
        const signature = 'valid_signature';

        // Mock crypto verification
        jest.doMock('crypto', () => ({
          createHmac: jest.fn(() => ({
            update: jest.fn(() => ({
              digest: jest.fn(() => 'valid_signature')
            }))
          }))
        }));

        const result = PaymentService.verifyRazorpayPayment(orderId, paymentId, signature);

        expect(result).toBe(true);
      });

      test('should reject invalid Razorpay signature', () => {
        const orderId = 'order_test123';
        const paymentId = 'pay_test123';
        const signature = 'invalid_signature';

        const result = PaymentService.verifyRazorpayPayment(orderId, paymentId, signature);

        expect(result).toBe(false);
      });
    });
  });

  describe('SearchService', () => {
    describe('searchRides', () => {
      test('should search with geolocation', async () => {
        const searchParams = {
          originCoords: { lat: 19.0596, lng: 72.8295 },
          destinationCoords: { lat: 18.5204, lng: 73.8567 },
          date: '2024-12-31',
          passengers: 2,
          radius: 10 // km
        };

        const mockRides = [
          {
            _id: 'ride-1',
            origin: { coordinates: { lat: 19.0600, lng: 72.8300 } },
            destination: { coordinates: { lat: 18.5200, lng: 73.8570 } },
            availableSeats: 3
          }
        ];

        const Ride = require('../models/Ride');
        Ride.find = jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockRides)
        });

        const result = await SearchService.searchRides(searchParams);

        expect(result.rides).toHaveLength(1);
        expect(Ride.find).toHaveBeenCalledWith(
          expect.objectContaining({
            availableSeats: { $gte: 2 }
          })
        );
      });

      test('should filter by price range', async () => {
        const searchParams = {
          origin: 'Mumbai',
          destination: 'Pune',
          minPrice: 400,
          maxPrice: 600
        };

        const Ride = require('../models/Ride');
        Ride.find = jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        });

        await SearchService.searchRides(searchParams);

        expect(Ride.find).toHaveBeenCalledWith(
          expect.objectContaining({
            pricePerSeat: { $gte: 400, $lte: 600 }
          })
        );
      });
    });

    describe('getPopularRoutes', () => {
      test('should return popular routes', async () => {
        const mockRoutes = [
          { route: 'Mumbai-Pune', count: 150 },
          { route: 'Delhi-Gurgaon', count: 120 },
          { route: 'Bangalore-Mysore', count: 100 }
        ];

        // Mock aggregation pipeline
        const Ride = require('../models/Ride');
        Ride.aggregate = jest.fn().mockResolvedValue(mockRoutes);

        const result = await SearchService.getPopularRoutes();

        expect(result).toHaveLength(3);
        expect(result[0].route).toBe('Mumbai-Pune');
        expect(result[0].count).toBe(150);
      });
    });
  });

  describe('NotificationService', () => {
    describe('sendBookingConfirmation', () => {
      test('should send booking confirmation notifications', async () => {
        const bookingData = {
          passengerId: 'passenger-123',
          driverId: 'driver-123',
          rideId: 'ride-123',
          seatsBooked: 2
        };

        const mockPassenger = {
          profile: { email: 'passenger@example.com', phone: '+1234567890' }
        };

        const mockDriver = {
          profile: { email: 'driver@example.com', phone: '+0987654321' }
        };

        const User = require('../models/User');
        User.findById = jest.fn()
          .mockResolvedValueOnce(mockPassenger)
          .mockResolvedValueOnce(mockDriver);

        // Mock notification services
        const emailService = { send: jest.fn().mockResolvedValue(true) };
        const smsService = { send: jest.fn().mockResolvedValue(true) };

        jest.doMock('../services/emailService', () => emailService);
        jest.doMock('../services/smsService', () => smsService);

        await NotificationService.sendBookingConfirmation(bookingData);

        expect(emailService.send).toHaveBeenCalledTimes(2); // Passenger and driver
        expect(smsService.send).toHaveBeenCalledTimes(2);
      });
    });

    describe('sendRideReminder', () => {
      test('should send ride reminder to passengers', async () => {
        const rideData = {
          _id: 'ride-123',
          departureDate: '2024-12-31',
          departureTime: '10:00',
          passengers: ['passenger-1', 'passenger-2']
        };

        const mockPassengers = [
          { profile: { email: 'p1@example.com' } },
          { profile: { email: 'p2@example.com' } }
        ];

        const User = require('../models/User');
        User.find = jest.fn().mockResolvedValue(mockPassengers);

        const emailService = { send: jest.fn().mockResolvedValue(true) };
        jest.doMock('../services/emailService', () => emailService);

        await NotificationService.sendRideReminder(rideData);

        expect(emailService.send).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('VehicleService', () => {
    describe('registerVehicle', () => {
      test('should register vehicle successfully', async () => {
        const vehicleData = {
          ownerId: 'owner-123',
          details: {
            make: 'Honda',
            model: 'City',
            licensePlate: 'MH01AB1234',
            seats: 4
          }
        };

        const mockVehicle = {
          _id: 'vehicle-123',
          ...vehicleData,
          verification: { status: 'pending' },
          save: jest.fn().mockResolvedValue(true)
        };

        const Vehicle = require('../models/Vehicle');
        Vehicle.mockImplementation(() => mockVehicle);

        const result = await VehicleService.registerVehicle(vehicleData);

        expect(result).toBeDefined();
        expect(result.verification.status).toBe('pending');
        expect(mockVehicle.save).toHaveBeenCalled();
      });

      test('should validate license plate uniqueness', async () => {
        const vehicleData = {
          ownerId: 'owner-123',
          details: {
            licensePlate: 'DUPLICATE123'
          }
        };

        const Vehicle = require('../models/Vehicle');
        Vehicle.findOne = jest.fn().mockResolvedValue({ _id: 'existing-vehicle' });

        await expect(VehicleService.registerVehicle(vehicleData))
          .rejects.toThrow('License plate already registered');
      });
    });

    describe('verifyVehicle', () => {
      test('should verify vehicle successfully', async () => {
        const vehicleId = 'vehicle-123';
        const verificationData = {
          status: 'verified',
          documents: ['registration.pdf', 'insurance.pdf']
        };

        const mockVehicle = {
          _id: vehicleId,
          verification: { status: 'pending' },
          save: jest.fn().mockResolvedValue(true)
        };

        const Vehicle = require('../models/Vehicle');
        Vehicle.findById = jest.fn().mockResolvedValue(mockVehicle);

        const result = await VehicleService.verifyVehicle(vehicleId, verificationData);

        expect(result.verification.status).toBe('verified');
        expect(mockVehicle.save).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      const User = require('../models/User');
      User.findById = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await expect(UserService.getUserById('user-123'))
        .rejects.toThrow('Database connection failed');
    });

    test('should handle validation errors', async () => {
      const invalidData = {
        // Missing required fields
        pricePerSeat: -100
      };

      await expect(RideService.createRide(invalidData))
        .rejects.toThrow();
    });

    test('should handle external service failures', async () => {
      // Mock external service failure
      jest.doMock('../services/emailService', () => ({
        send: jest.fn().mockRejectedValue(new Error('Email service unavailable'))
      }));

      const bookingData = {
        passengerId: 'passenger-123',
        driverId: 'driver-123'
      };

      // Should not throw error, but should log the failure
      await expect(NotificationService.sendBookingConfirmation(bookingData))
        .resolves.not.toThrow();
    });
  });

  describe('Performance Tests', () => {
    test('should handle large search results efficiently', async () => {
      const largeResultSet = Array(1000).fill().map((_, index) => ({
        _id: `ride-${index}`,
        origin: { city: 'Mumbai' },
        destination: { city: 'Pune' },
        pricePerSeat: 500 + index
      }));

      const Ride = require('../models/Ride');
      Ride.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              skip: jest.fn().mockResolvedValue(largeResultSet.slice(0, 20))
            })
          })
        })
      });

      const startTime = Date.now();
      const result = await SearchService.searchRides({
        origin: 'Mumbai',
        destination: 'Pune',
        limit: 20
      });
      const endTime = Date.now();

      expect(result.rides).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should cache frequently accessed data', async () => {
      const cacheService = require('../services/cacheService');
      cacheService.get = jest.fn().mockResolvedValue(null);
      cacheService.set = jest.fn().mockResolvedValue(true);

      const popularRoutes = await SearchService.getPopularRoutes();

      expect(cacheService.get).toHaveBeenCalledWith('popular_routes');
      expect(cacheService.set).toHaveBeenCalledWith('popular_routes', expect.any(Array), 3600);
    });
  });
});