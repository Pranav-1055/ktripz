# TripO Notification System

The TripO notification system provides comprehensive multi-channel notifications including real-time WebSocket updates, SMS, email, and push notifications.

## Features

### Notification Channels
- **Real-time**: WebSocket notifications via Socket.io
- **SMS**: Text messages via Twilio
- **Email**: HTML/text emails via SendGrid
- **Push**: Mobile push notifications via Firebase Cloud Messaging (FCM)

### Notification Types
- Booking requests and confirmations
- Booking cancellations and status changes
- Ride reminders and updates
- Trip tracking and location updates
- Messages between users
- Payment updates
- Promotional notifications

### User Preferences
- Granular control over notification channels per notification type
- Quiet hours configuration
- Frequency limits to prevent spam
- FCM token management

### Automated Scheduling
- Ride reminders (60 minutes and 15 minutes before departure)
- Booking timeout handling
- Cleanup of expired notification records

## Architecture

### Services

#### NotificationService
Main service for sending notifications across all channels.

**Key Methods:**
- `sendSMS(phoneNumber, message, options)` - Send SMS via Twilio
- `sendEmail(to, subject, htmlContent, textContent, options)` - Send email via SendGrid
- `sendPushNotification(tokens, notification, data, options)` - Send push via FCM
- `sendComprehensiveNotification(userId, notificationData, userPreferences, userContact)` - Send across all enabled channels

#### NotificationPreferencesService
Manages user notification preferences and settings.

**Key Methods:**
- `getUserPreferences(userId)` - Get user's notification preferences
- `updateUserPreferences(userId, preferences)` - Update preferences
- `shouldSendNotification(userId, notificationType, channel)` - Check if notification should be sent
- `getNotificationChannels(userId, notificationType)` - Get enabled channels for notification type

#### NotificationSchedulerService
Handles automated and scheduled notifications.

**Key Methods:**
- `checkRideReminders()` - Process upcoming ride reminders
- `checkBookingTimeouts()` - Handle expired booking requests
- `scheduleNotification(userId, notification, scheduledTime, jobId)` - Schedule custom notification
- `cancelScheduledNotification(jobId)` - Cancel scheduled notification

#### RealtimeService
Manages real-time WebSocket notifications.

**Key Methods:**
- `notifyRideUpdate(rideId, changes)` - Notify about ride changes
- `notifyBookingStatusChange(bookingId, passengerId, driverId, newStatus)` - Booking status updates
- `notifyTripStatus(rideId, status, trackingData)` - Trip tracking updates

## Configuration

### Environment Variables

```bash
# Twilio SMS
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# SendGrid Email
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@tripo.com
SENDGRID_FROM_NAME=TripO

# Firebase (for FCM and Firestore)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
```

### Service Initialization

The notification system is automatically initialized when the server starts:

```javascript
// In server.js
const NotificationSchedulerService = require('./services/notificationSchedulerService');

// Initialize notification scheduler
NotificationSchedulerService.initialize();
```

## API Endpoints

### Notification Management
- `GET /api/notifications/status` - Get service status
- `GET /api/notifications/preferences` - Get user preferences
- `PUT /api/notifications/preferences` - Update user preferences
- `POST /api/notifications/fcm-token` - Update FCM token

### Testing Endpoints
- `POST /api/notifications/test` - Send test notification
- `POST /api/notifications/sms` - Send test SMS
- `POST /api/notifications/email` - Send test email
- `POST /api/notifications/push` - Send test push notification

### Real-time Endpoints
- `GET /api/realtime/stats` - Get WebSocket statistics
- `POST /api/realtime/test-notification` - Send test real-time notification

## Usage Examples

### Sending a Comprehensive Notification

```javascript
const NotificationService = require('./services/notificationService');
const NotificationPreferencesService = require('./services/notificationPreferencesService');

async function sendBookingConfirmation(userId, bookingData) {
  const notificationData = {
    type: 'booking_confirmed',
    title: 'Booking Confirmed!',
    message: `Your booking for ${bookingData.origin} to ${bookingData.destination} has been confirmed.`,
    data: {
      bookingId: bookingData.id,
      rideId: bookingData.rideId,
    },
    priority: 'high',
  };

  const userPreferences = await NotificationPreferencesService.getNotificationChannels(
    userId,
    'bookingConfirmations'
  );

  const userContact = {
    email: 'user@example.com',
    phoneNumber: '+1234567890',
    fcmToken: 'user-fcm-token',
  };

  const result = await NotificationService.sendComprehensiveNotification(
    userId,
    notificationData,
    userPreferences,
    userContact
  );

  console.log('Notification result:', result);
}
```

### Updating User Preferences

```javascript
const NotificationPreferencesService = require('./services/notificationPreferencesService');

async function updateUserNotificationPreferences(userId) {
  const preferences = {
    email: true,
    sms: false,
    push: true,
    bookingConfirmations: {
      email: true,
      sms: true,
      push: true,
    },
    quietHours: {
      enabled: true,
      start: '22:00',
      end: '08:00',
      timezone: 'America/New_York',
    },
  };

  await NotificationPreferencesService.updateUserPreferences(userId, preferences);
}
```

### Scheduling a Custom Notification

```javascript
const NotificationSchedulerService = require('./services/notificationSchedulerService');

async function scheduleRideReminder(userId, rideData) {
  const reminderTime = new Date(rideData.departureTime.getTime() - 60 * 60 * 1000); // 1 hour before
  
  const notification = {
    type: 'ride_reminder',
    title: 'Ride Reminder',
    message: `Your ride departs in 1 hour from ${rideData.origin}`,
    data: {
      rideId: rideData.id,
    },
  };

  await NotificationSchedulerService.scheduleNotification(
    userId,
    notification,
    reminderTime,
    `ride_reminder_${rideData.id}_${userId}`
  );
}
```

## WebSocket Events

### Client to Server Events
- `join_ride` - Join ride-specific room
- `leave_ride` - Leave ride-specific room
- `join_booking` - Join booking-specific room
- `leave_booking` - Leave booking-specific room
- `share_location` - Share location for trip tracking
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator

### Server to Client Events
- `ride_updated` - Ride availability or details changed
- `booking_status_changed` - Booking status update
- `trip_tracking_update` - Trip tracking and location updates
- `notification` - General notification
- `message_received` - Message from another user
- `location_update` - Location update from driver
- `user_typing` - Typing indicator from another user

## Default Notification Preferences

```javascript
{
  // Channel preferences
  realtime: true,    // Always enabled
  email: true,       // Email notifications
  sms: false,        // SMS notifications (opt-in)
  push: true,        // Push notifications

  // Type-specific preferences
  bookingRequests: { realtime: true, email: true, sms: false, push: true },
  bookingConfirmations: { realtime: true, email: true, sms: true, push: true },
  bookingCancellations: { realtime: true, email: true, sms: true, push: true },
  rideReminders: { realtime: true, email: false, sms: true, push: true },
  rideUpdates: { realtime: true, email: false, sms: false, push: true },
  tripTracking: { realtime: true, email: false, sms: false, push: true },
  messages: { realtime: true, email: false, sms: false, push: true },
  paymentUpdates: { realtime: true, email: true, sms: false, push: true },
  promotions: { realtime: false, email: true, sms: false, push: false },

  // Timing preferences
  reminderTiming: {
    beforeRide: [60, 15], // Minutes before ride
    afterBooking: 5,      // Minutes after booking
  },

  // Quiet hours
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
    timezone: 'UTC',
  },

  // Frequency limits
  frequencyLimits: {
    maxSMSPerDay: 5,
    maxEmailsPerDay: 10,
    maxPushPerHour: 20,
  },
}
```

## Testing

Run the notification service tests:

```bash
npm test -- notificationService.test.js
```

### Manual Testing

1. **WebSocket Demo**: Visit `http://localhost:3000/demo/realtime-demo.html`
2. **API Testing**: Use the test endpoints to verify each notification channel
3. **Preference Testing**: Update preferences via API and verify behavior

## Monitoring and Logging

The notification system provides comprehensive logging:

- Service initialization status
- Notification sending results
- Scheduling and automation events
- Error handling and failures
- Performance metrics

All logs are structured and include relevant context for debugging and monitoring.

## Error Handling

The system is designed to be resilient:

- **Graceful Degradation**: If one channel fails, others continue working
- **Retry Logic**: Automatic retries for transient failures
- **Fallback Options**: Real-time notifications always work as fallback
- **Error Reporting**: Detailed error information for debugging

## Security Considerations

- **Authentication**: All API endpoints require valid Firebase tokens
- **Rate Limiting**: Built-in frequency limits prevent abuse
- **Data Validation**: Input validation on all notification data
- **Privacy**: User preferences control what notifications are sent
- **Secure Tokens**: FCM tokens are securely stored and managed