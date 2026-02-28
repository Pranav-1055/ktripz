# Design Document

## Overview

This design document outlines the technical architecture and implementation approach for enhancing the TripO ride-sharing application with BlaBlaCar-like features. The design builds upon the existing Firebase-based architecture while introducing new components for dynamic ride management, real-time search, booking system, and enhanced user experience.

The solution maintains the existing theme, authentication system, and user roles (passenger/transport provider) while adding sophisticated ride-sharing functionality that matches modern expectations for such platforms.

## Architecture

### High-Level Architecture (Node.js Backend + Existing Frontend)

```mermaid
graph TB
    subgraph "Frontend (Existing TripO UI)"
        A[Passenger Interface - home.html]
        B[Provider Interface - provider-dashboard.html]
        C[Authentication - login pages]
        D[Shared Components]
    end
    
    subgraph "Node.js Backend API"
        E[Express.js Server]
        F[Authentication Middleware]
        G[Ride Management API]
        H[Booking System API]
        I[Search Engine API]
        J[Payment Processing API]
        K[Notification Service]
        L[Real-time WebSocket Server]
    end
    
    subgraph "Database Layer"
        M[MongoDB/PostgreSQL]
        N[Redis Cache]
        O[Firebase Auth (existing)]
    end
    
    subgraph "External Services"
        P[Google Maps API]
        Q[Payment Gateway (Razorpay/Stripe)]
        R[SMS Service (Twilio)]
        S[Email Service (SendGrid)]
    end
    
    A --> E
    B --> E
    C --> O
    E --> F
    F --> G
    F --> H
    F --> I
    G --> M
    H --> M
    I --> N
    J --> Q
    K --> R
    K --> S
    L --> A
    L --> B
    I --> P
```

### Database Schema Design (Node.js + MongoDB/PostgreSQL)

#### MongoDB Collections Structure:

```javascript
// Users Collection
{
  _id: ObjectId,
  firebaseUid: String, // Link to existing Firebase Auth
  profile: {
    name: String,
    email: String,
    phone: String,
    role: String, // passenger, provider, both
    avatar: String,
    bio: String,
    dateOfBirth: Date,
    gender: String
  },
  verification: {
    email: Boolean,
    phone: Boolean,
    identity: Boolean,
    drivingLicense: Boolean,
    backgroundCheck: Boolean
  },
  rating: {
    asPassenger: { average: Number, count: Number },
    asDriver: { average: Number, count: Number }
  },
  preferences: {
    smoking: Boolean,
    pets: Boolean,
    music: Boolean,
    conversation: String,
    autoApproveBookings: Boolean
  },
  stats: {
    totalRidesAsPassenger: Number,
    totalRidesAsDriver: Number,
    totalEarnings: Number,
    memberSince: Date,
    lastActiveAt: Date
  },
  createdAt: Date,
  updatedAt: Date
}

// Rides Collection
{
  _id: ObjectId,
  driverId: ObjectId,
  origin: {
    city: String,
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  destination: {
    city: String,
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  departureDate: Date,
  departureTime: String,
  pricePerSeat: Number,
  totalSeats: Number,
  availableSeats: Number,
  vehicle: {
    make: String,
    model: String,
    color: String,
    licensePlate: String,
    amenities: [String]
  },
  route: {
    waypoints: [{ lat: Number, lng: Number, name: String }],
    pickupPoints: [{ 
      name: String, 
      coordinates: { lat: Number, lng: Number },
      timeOffset: Number 
    }],
    estimatedDuration: Number,
    distance: Number
  },
  preferences: {
    smoking: Boolean,
    pets: Boolean,
    music: Boolean,
    conversation: String
  },
  bookingPolicy: {
    instantBooking: Boolean,
    requiresApproval: Boolean,
    cancellationPolicy: String
  },
  passengers: [{
    userId: ObjectId,
    seatsBooked: Number,
    status: String, // requested, confirmed, cancelled
    bookingTime: Date,
    pickupPoint: String
  }],
  status: String, // published, in_progress, completed, cancelled
  createdAt: Date,
  updatedAt: Date
}

// Bookings Collection
{
  _id: ObjectId,
  rideId: ObjectId,
  passengerId: ObjectId,
  driverId: ObjectId,
  seatsBooked: Number,
  pickupPoint: {
    name: String,
    coordinates: { lat: Number, lng: Number },
    time: String
  },
  pricing: {
    pricePerSeat: Number,
    totalAmount: Number,
    serviceFee: Number,
    finalAmount: Number
  },
  payment: {
    method: String,
    transactionId: String,
    status: String,
    paidAt: Date
  },
  status: String, // requested, confirmed, completed, cancelled
  createdAt: Date,
  updatedAt: Date
}

// Vehicles Collection
{
  _id: ObjectId,
  ownerId: ObjectId,
  details: {
    make: String,
    model: String,
    year: Number,
    color: String,
    licensePlate: String,
    seats: Number
  },
  amenities: [String],
  documents: {
    registration: String, // file path
    insurance: String,
    inspection: String
  },
  verification: {
    status: String, // pending, verified, rejected
    verifiedAt: Date
  },
  createdAt: Date,
  updatedAt: Date
}

// Reviews Collection
{
  _id: ObjectId,
  rideId: ObjectId,
  bookingId: ObjectId,
  reviewerId: ObjectId,
  revieweeId: ObjectId,
  reviewerRole: String, // passenger, driver
  rating: {
    overall: Number,
    punctuality: Number,
    cleanliness: Number,
    communication: Number
  },
  comment: String,
  createdAt: Date
}
```

#### Redis Cache Structure:
```javascript
// Search Results Cache
"search:{origin}:{destination}:{date}" = JSON.stringify(rideResults)

// User Sessions
"session:{userId}" = JSON.stringify(sessionData)

// Real-time Ride Updates
"ride_updates:{rideId}" = JSON.stringify(liveUpdates)

// Popular Routes
"popular_routes" = JSON.stringify(routesList)
```

## Components and Interfaces (Node.js Backend APIs)

### 1. Authentication & User Management API

**Purpose:** Handle user authentication, profile management, and role-based access control.

**Endpoints:**
```javascript
// Authentication (integrates with existing Firebase Auth)
POST /api/auth/verify-token        // Verify Firebase token
POST /api/auth/sync-user          // Sync Firebase user with MongoDB
GET  /api/auth/profile            // Get user profile
PUT  /api/auth/profile            // Update user profile

// User Management
GET  /api/users/:userId           // Get user details
PUT  /api/users/:userId/verify    // Update verification status
GET  /api/users/:userId/rating    // Get user ratings
POST /api/users/:userId/rating    // Add rating/review
```

### 2. Ride Management API (Provider Functions)

**Purpose:** Handle ride creation, management, and provider dashboard functionality.

**Endpoints:**
```javascript
// Ride CRUD Operations
POST /api/rides                   // Create new ride (providers only)
GET  /api/rides                   // Search rides (with filters)
GET  /api/rides/:rideId           // Get ride details
PUT  /api/rides/:rideId           // Update ride (owner only)
DELETE /api/rides/:rideId         // Cancel ride (owner only)

// Provider Dashboard
GET  /api/provider/rides          // Get provider's rides
GET  /api/provider/bookings       // Get booking requests
GET  /api/provider/earnings       // Get earnings data
PUT  /api/provider/booking/:bookingId/approve  // Approve booking
PUT  /api/provider/booking/:bookingId/reject   // Reject booking
```

### 3. Search & Discovery API

**Purpose:** Provide intelligent ride search with filtering, sorting, and recommendations.

**Endpoints:**
```javascript
// Search Operations
GET  /api/search/rides            // Search rides with filters
GET  /api/search/popular-routes   // Get popular routes
GET  /api/search/suggestions      // Get search suggestions
POST /api/search/save             // Save search preferences

// Location Services
GET  /api/locations/cities        // Get supported cities
GET  /api/locations/autocomplete  // City/location autocomplete
GET  /api/locations/pickup-points // Get pickup points for route
```

### 4. Booking System API

**Purpose:** Handle the complete booking flow from request to completion.

**Endpoints:**
```javascript
// Booking Operations
POST /api/bookings                // Create booking request
GET  /api/bookings/:bookingId     // Get booking details
PUT  /api/bookings/:bookingId     // Update booking
DELETE /api/bookings/:bookingId   // Cancel booking

// Passenger Dashboard
GET  /api/passenger/bookings      // Get passenger's bookings
GET  /api/passenger/history       // Get booking history
POST /api/passenger/review        // Submit review after trip
```

### 5. Payment Processing API

**Purpose:** Handle secure payment processing and financial transactions.

**Endpoints:**
```javascript
// Payment Operations
POST /api/payments/initiate       // Initiate payment
POST /api/payments/verify         // Verify payment status
POST /api/payments/refund         // Process refund
GET  /api/payments/history        // Get payment history

// Provider Payouts
GET  /api/payouts/earnings        // Get provider earnings
POST /api/payouts/request         // Request payout
GET  /api/payouts/history         // Get payout history
```

### 6. Real-time Communication API

**Purpose:** Handle real-time updates, notifications, and messaging.

**WebSocket Events:**
```javascript
// Real-time Events
'ride_updated'          // Ride availability changed
'booking_request'       // New booking request
'booking_confirmed'     // Booking confirmed
'payment_completed'     // Payment processed
'trip_started'          // Trip started
'trip_completed'        // Trip completed

// Messaging
'message_received'      // New message
'typing_indicator'      // User typing
'location_shared'       // Location shared
```

### 7. Vehicle Management API

**Purpose:** Handle vehicle registration, verification, and management for providers.

**Endpoints:**
```javascript
// Vehicle Operations
POST /api/vehicles                // Register new vehicle
GET  /api/vehicles                // Get user's vehicles
PUT  /api/vehicles/:vehicleId     // Update vehicle details
DELETE /api/vehicles/:vehicleId   // Remove vehicle
POST /api/vehicles/:vehicleId/documents  // Upload documents
```

### 8. Analytics & Reporting API

**Purpose:** Provide business intelligence and analytics for providers and platform.

**Endpoints:**
```javascript
// Provider Analytics
GET  /api/analytics/provider/dashboard    // Provider dashboard stats
GET  /api/analytics/provider/earnings     // Earnings analytics
GET  /api/analytics/provider/performance  // Performance metrics

// Platform Analytics (Admin)
GET  /api/analytics/platform/overview     // Platform overview
GET  /api/analytics/platform/routes       // Route analytics
GET  /api/analytics/platform/users        // User analytics
```

## Data Models

### Ride Model (BlaBlaCar-style)
```javascript
const RideModel = {
  id: String,
  driverId: String,
  origin: {
    city: String,
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  destination: {
    city: String,
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  departureDate: String, // YYYY-MM-DD
  departureTime: String, // HH:MM
  arrivalTime: String,   // HH:MM (estimated)
  pricePerSeat: Number,
  totalSeats: Number,
  availableSeats: Number,
  driver: {
    name: String,
    avatar: String,
    rating: Number,
    reviewCount: Number,
    verificationLevel: String, // basic, verified, experienced
    memberSince: Date
  },
  vehicle: {
    make: String,
    model: String,
    color: String,
    year: Number,
    licensePlate: String,
    amenities: [String], // ['wifi', 'ac', 'music', 'charging']
    maxBags: Number
  },
  route: {
    waypoints: [{ lat: Number, lng: Number, name: String }],
    pickupPoints: [{ 
      name: String, 
      address: String, 
      coordinates: { lat: Number, lng: Number },
      timeOffset: Number // minutes from departure
    }],
    estimatedDuration: Number, // minutes
    distance: Number // kilometers
  },
  preferences: {
    smoking: Boolean,
    pets: Boolean,
    music: Boolean,
    conversation: String, // 'bla_bla', 'not_much', 'whatever'
    maxBackSeats: Number
  },
  bookingPolicy: {
    instantBooking: Boolean,
    requiresApproval: Boolean,
    cancellationPolicy: String,
    advanceBookingHours: Number
  },
  passengers: {
    [userId]: {
      seatsBooked: Number,
      status: String, // requested, confirmed, cancelled
      bookingTime: Date,
      pickupPoint: String,
      dropoffPoint: String
    }
  },
  status: String, // published, in_progress, completed, cancelled
  publishedAt: Date,
  updatedAt: Date
};
```

### Booking Model (Passenger-focused)
```javascript
const BookingModel = {
  id: String,
  rideId: String,
  passengerId: String,
  driverId: String,
  seatsBooked: Number,
  pickupPoint: {
    name: String,
    address: String,
    coordinates: { lat: Number, lng: Number },
    time: String // HH:MM
  },
  dropoffPoint: {
    name: String,
    address: String,
    coordinates: { lat: Number, lng: Number },
    time: String // HH:MM (estimated)
  },
  pricing: {
    pricePerSeat: Number,
    totalAmount: Number,
    serviceFee: Number,
    finalAmount: Number
  },
  payment: {
    method: String, // card, wallet, upi, cash
    transactionId: String,
    status: String, // pending, completed, failed, refunded
    paidAt: Date,
    refundAmount: Number,
    refundedAt: Date
  },
  communication: {
    driverPhone: String, // revealed after booking confirmation
    messages: [{
      from: String, // userId
      to: String,   // userId
      message: String,
      timestamp: Date,
      type: String // text, location, photo
    }]
  },
  status: String, // requested, confirmed, completed, cancelled_by_passenger, cancelled_by_driver
  requestedAt: Date,
  confirmedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancellationReason: String
};
```

### User Profile Model (Dual Role Support)
```javascript
const UserProfileModel = {
  id: String,
  name: String,
  email: String,
  phone: String,
  role: String, // passenger, provider, both
  avatar: String,
  bio: String,
  dateOfBirth: Date,
  gender: String,
  
  // Verification Status
  verification: {
    email: Boolean,
    phone: Boolean,
    identity: Boolean,
    drivingLicense: Boolean, // for providers
    backgroundCheck: Boolean // for providers
  },
  
  // Dual Rating System (as passenger and as driver)
  rating: {
    asPassenger: {
      average: Number,
      count: Number,
      breakdown: {
        punctuality: Number,
        friendliness: Number,
        cleanliness: Number
      }
    },
    asDriver: {
      average: Number,
      count: Number,
      breakdown: {
        driving: Number,
        punctuality: Number,
        friendliness: Number,
        vehicleCondition: Number
      }
    }
  },
  
  // User Preferences
  preferences: {
    smoking: Boolean,
    pets: Boolean,
    music: Boolean,
    conversation: String, // 'love_to_chat', 'depends_on_mood', 'prefer_quiet'
    autoApproveBookings: Boolean, // for drivers
    notifications: {
      email: Boolean,
      sms: Boolean,
      push: Boolean
    }
  },
  
  // Statistics
  stats: {
    totalRidesAsPassenger: Number,
    totalRidesAsDriver: Number,
    totalEarnings: Number, // for providers
    memberSince: Date,
    lastActiveAt: Date,
    completionRate: Number, // percentage of completed vs cancelled rides
    responseTime: Number // average response time in minutes
  },
  
  // Provider-specific data
  providerData: {
    businessName: String,
    businessType: String, // individual, company
    vehicles: [String], // array of vehicle IDs
    operatingRoutes: [String], // frequently used routes
    payoutDetails: {
      bankAccount: String,
      ifscCode: String,
      accountHolder: String
    }
  }
};
```

## Technology Stack

### Backend (Node.js)
- **Runtime:** Node.js 18+ with Express.js framework
- **Database:** MongoDB with Mongoose ODM (primary) + Redis for caching
- **Authentication:** Firebase Admin SDK (integrate with existing Firebase Auth)
- **Real-time:** Socket.io for WebSocket connections
- **Payment:** Razorpay/Stripe integration
- **Maps:** Google Maps API for geocoding and routing
- **Notifications:** 
  - SMS: Twilio
  - Email: SendGrid/Nodemailer
  - Push: Firebase Cloud Messaging
- **File Storage:** AWS S3 or Google Cloud Storage
- **Validation:** Joi for request validation
- **Security:** Helmet.js, CORS, rate limiting
- **Logging:** Winston with structured logging
- **Testing:** Jest for unit tests, Supertest for API tests

### Frontend (Existing TripO UI)
- **Keep Current:** HTML, CSS, JavaScript (vanilla)
- **Enhance With:** 
  - Axios for API calls
  - Socket.io-client for real-time updates
  - Chart.js for analytics (provider dashboard)
  - Leaflet.js or Google Maps JS API for maps

### DevOps & Deployment
- **Containerization:** Docker
- **Orchestration:** Docker Compose (development) / Kubernetes (production)
- **CI/CD:** GitHub Actions or GitLab CI
- **Monitoring:** PM2 for process management, New Relic/DataDog for monitoring
- **Load Balancing:** Nginx reverse proxy
- **SSL:** Let's Encrypt certificates

## Error Handling
- Network connectivity issues with offline fallback
- Form validation with real-time feedback
- Payment processing errors with retry mechanisms
- Search timeout handling with cached results

### Server-Side Error Handling
- Firebase connection failures with retry logic
- Payment gateway integration errors
- Data validation and sanitization
- Rate limiting and abuse prevention

### Error Response Format
```javascript
const ErrorResponse = {
  success: false,
  error: {
    code: String,
    message: String,
    details: Object,
    timestamp: Date
  }
};
```

## Testing Strategy

### Unit Testing
- Component functionality testing
- Data model validation
- Business logic verification
- Error handling scenarios

### Integration Testing
- Firebase integration testing
- Payment gateway integration
- External API integration (Maps, SMS)
- Cross-component communication

### End-to-End Testing
- Complete user journeys (search to booking)
- Multi-user scenarios (provider and passenger)
- Payment flow testing
- Notification delivery testing

### Performance Testing
- Search response time optimization
- Database query performance
- Real-time update efficiency
- Mobile device performance

## Security Considerations

### Authentication and Authorization
- Firebase Authentication integration
- Role-based access control
- Session management and token validation
- Multi-factor authentication for providers

### Data Protection
- Personal information encryption
- Payment data security (PCI compliance)
- GDPR compliance for user data
- Secure communication protocols

### Input Validation
- Client and server-side validation
- SQL injection prevention
- XSS attack prevention
- Rate limiting and DDoS protection

## Performance Optimization

### Frontend Optimization
- Code splitting and lazy loading
- Image optimization and caching
- Progressive Web App features
- Service worker implementation

### Backend Optimization
- Database query optimization
- Caching strategies for frequent queries
- CDN integration for static assets
- Real-time connection management

### Mobile Optimization
- Touch-friendly interface design
- Offline functionality
- Reduced data usage
- Battery optimization

## Deployment and Monitoring

### Deployment Strategy
- Staged deployment (development → staging → production)
- Feature flags for gradual rollout
- Automated testing in CI/CD pipeline
- Database migration strategies

### Monitoring and Analytics
- User behavior tracking
- Performance monitoring
- Error tracking and alerting
- Business metrics dashboard

### Maintenance and Updates
- Regular security updates
- Feature enhancement cycles
- User feedback integration
- Performance optimization reviews