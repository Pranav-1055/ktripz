# TripO Backend API

BlaBlaCar-like ride sharing backend API built with Node.js, Express.js, Firebase Admin SDK, and Redis.

## Features

- **Express.js Server**: RESTful API with proper middleware setup
- **Firebase Integration**: Authentication and database operations using Firebase Admin SDK
- **Redis Caching**: Session management and caching for improved performance
- **Security**: Helmet.js, CORS, rate limiting, and input validation
- **Logging**: Structured logging with Winston
- **Error Handling**: Comprehensive error handling and validation

## Prerequisites

- Node.js 18+ 
- Redis server
- Firebase project with Admin SDK credentials

## Installation

1. Clone the repository and navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
   - Firebase project credentials
   - Redis connection details
   - Security settings

## Configuration

### Firebase Setup

1. Go to your Firebase Console
2. Navigate to Project Settings > Service Accounts
3. Generate a new private key
4. Either:
   - Download the JSON file and set `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env`
   - Or copy the individual values to the respective environment variables

### Redis Setup

Make sure Redis is running on your system:
```bash
# On macOS with Homebrew
brew services start redis

# On Ubuntu/Debian
sudo systemctl start redis-server

# Using Docker
docker run -d -p 6379:6379 redis:alpine
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Running Tests
```bash
npm test
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### API Info
- `GET /api` - API information and available endpoints

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── firebase.js      # Firebase Admin SDK configuration
│   │   └── redis.js         # Redis connection and cache utilities
│   ├── middleware/
│   │   ├── index.js         # General middleware setup
│   │   └── auth.js          # Authentication middleware
│   ├── routes/
│   │   └── index.js         # Route setup and organization
│   ├── utils/
│   │   └── logger.js        # Winston logger configuration
│   └── server.js            # Main server file
├── logs/                    # Log files (created automatically)
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | - |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | - |
| `FIREBASE_CLIENT_EMAIL` | Firebase client email | - |
| `FIREBASE_DATABASE_URL` | Firebase database URL | - |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `LOG_LEVEL` | Logging level | `info` |

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing configuration
- **Rate Limiting**: Request rate limiting per IP
- **Input Validation**: Request validation using express-validator
- **Authentication**: Firebase token verification
- **Authorization**: Role-based access control

## Logging

The application uses Winston for structured logging:
- Console output for development
- File logging for production
- Error logs in `logs/error.log`
- Combined logs in `logs/combined.log`

## Error Handling

Standardized error responses:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "timestamp": "2024-01-08T10:00:00.000Z"
  }
}
```

## Next Steps

This is the basic infrastructure setup. The following components will be added in subsequent tasks:
- User management and profile APIs
- Ride management APIs
- Booking system APIs
- Search and discovery APIs
- Payment processing APIs
- Real-time communication with WebSockets
- Vehicle management APIs
- Analytics and reporting APIs

## Contributing

1. Follow the existing code structure and patterns
2. Add proper error handling and logging
3. Include input validation for all endpoints
4. Write tests for new functionality
5. Update documentation as needed