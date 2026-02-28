// MongoDB initialization script for production
db = db.getSiblingDB('tripo');

// Create application user
db.createUser({
  user: 'tripo_app',
  pwd: process.env.MONGO_APP_PASSWORD || 'change_this_password',
  roles: [
    {
      role: 'readWrite',
      db: 'tripo'
    }
  ]
});

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['firebaseUid', 'email', 'role'],
      properties: {
        firebaseUid: {
          bsonType: 'string',
          description: 'Firebase UID is required'
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
          description: 'Valid email is required'
        },
        role: {
          enum: ['passenger', 'provider', 'both'],
          description: 'Role must be passenger, provider, or both'
        }
      }
    }
  }
});

db.createCollection('rides', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['driverId', 'origin', 'destination', 'departureDate', 'pricePerSeat', 'totalSeats'],
      properties: {
        driverId: {
          bsonType: 'objectId',
          description: 'Driver ID is required'
        },
        pricePerSeat: {
          bsonType: 'number',
          minimum: 0,
          description: 'Price per seat must be a positive number'
        },
        totalSeats: {
          bsonType: 'int',
          minimum: 1,
          maximum: 8,
          description: 'Total seats must be between 1 and 8'
        }
      }
    }
  }
});

db.createCollection('bookings', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['rideId', 'passengerId', 'driverId', 'seatsBooked'],
      properties: {
        seatsBooked: {
          bsonType: 'int',
          minimum: 1,
          maximum: 8,
          description: 'Seats booked must be between 1 and 8'
        }
      }
    }
  }
});

// Create indexes for performance
db.users.createIndex({ 'firebaseUid': 1 }, { unique: true });
db.users.createIndex({ 'email': 1 }, { unique: true });
db.users.createIndex({ 'role': 1 });

db.rides.createIndex({ 'driverId': 1 });
db.rides.createIndex({ 'origin.city': 1, 'destination.city': 1 });
db.rides.createIndex({ 'departureDate': 1 });
db.rides.createIndex({ 'status': 1 });
db.rides.createIndex({ 'origin.coordinates': '2dsphere' });
db.rides.createIndex({ 'destination.coordinates': '2dsphere' });

db.bookings.createIndex({ 'rideId': 1 });
db.bookings.createIndex({ 'passengerId': 1 });
db.bookings.createIndex({ 'driverId': 1 });
db.bookings.createIndex({ 'status': 1 });

db.vehicles.createIndex({ 'ownerId': 1 });
db.reviews.createIndex({ 'rideId': 1 });
db.reviews.createIndex({ 'reviewerId': 1 });
db.reviews.createIndex({ 'revieweeId': 1 });

print('Database initialization completed successfully');