const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { handleValidationErrors, asyncHandler, sendResponse, sendError } = require('../middleware');
const UserService = require('../services/userService');
const { verifyIdToken, getAuth, getFirestore } = require('../config/firebase');
const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const debugLog = (msg) => {
  const logMsg = `[${new Date().toISOString()}] ${msg}\n`;
  console.log('[Auth Debug]', msg);
  try {
    fs.appendFileSync(path.join(process.cwd(), 'auth-debug.log'), logMsg);
  } catch (e) { console.error('Failed to write to debug log', e); }
};

/**
 * POST /api/auth/initiate-verification
 * Generate token, save to DB, send email
 */
router.post('/initiate-verification', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('uid').notEmpty().withMessage('UID is required'),
  body('userType').optional().isIn(['passenger', 'transport_provider']),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const { email, uid, userType = 'passenger' } = req.body;

  try {
    debugLog(`Initiating verification for ${email}, uid: ${uid}`);

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    debugLog('Token generated');

    // Save token to Firestore
    const db = getFirestore();
    debugLog('Got Firestore instance');

    await db.collection('verification_tokens').doc(uid).set({
      token,
      email,
      uid,
      userType, // Store userType to know if we should create provider doc later
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    });
    debugLog('Token saved to Firestore');

    // Construct verification link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationLink = `${frontendUrl}/verify-email?token=${token}&uid=${uid}`;
    debugLog(`Verification link: ${verificationLink}`);

    // Reuse existing email sending logic
    const userTypeLabel = userType === 'transport_provider' ? 'Transport Provider' : 'Passenger';
    const subject = `Verify Your ${userTypeLabel} Account - TripO`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0D3B78;">Verify Your Email</h2>
          <p>Hi there!</p>
          <p>Please click the button below to verify your email address for TripO:</p>
          <a href="${verificationLink}" style="display: inline-block; background: #0D3B78; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email</a>
          <p>Or copy this link: ${verificationLink}</p>
          <p>This link expires in 24 hours.</p>
        </div>
      </body>
      </html>
    `;

    const textContent = `Verify your email: ${verificationLink}`;

    debugLog('Sending email...');
    const emailResult = await NotificationService.sendEmail(
      email,
      subject,
      htmlContent,
      textContent,
      { category: 'email_verification', userType }
    );
    debugLog(`Email result: ${JSON.stringify(emailResult)}`);

    if (emailResult.success) {
      sendResponse(res, 200, { success: true }, 'Verification email sent');
    } else {
      throw new Error(`Failed to send email: ${emailResult.error}`);
    }

  } catch (error) {
    debugLog(`ERROR: ${error.message}\n${error.stack}`);
    logger.error('Initiate verification failed:', error);
    sendError(res, 500, 'VERIFICATION_INIT_FAILED', `Failed to initiate verification: ${error.message}`);
  }
}));

/**
 * POST /api/auth/confirm-verification
 * Validate token, update Firebase Auth
 */
router.post('/confirm-verification', [
  body('token').notEmpty(),
  body('uid').notEmpty(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const { token, uid } = req.body;

  try {
    debugLog(`[CONFIRM_VERIFICATION] Request received for uid: ${uid}, token: ${token}`);

    const db = getFirestore();
    const docRef = db.collection('verification_tokens').doc(uid);
    const doc = await docRef.get();

    if (!doc.exists) {
      debugLog(`[CONFIRM_VERIFICATION] No verification doc found for uid: ${uid}`);

      // Check if user is already verified (Check Firebase Auth as source of truth)
      try {
        const auth = getAuth();
        const userRecord = await auth.getUser(uid);
        if (userRecord.emailVerified) {
          debugLog(`[CONFIRM_VERIFICATION] User ${uid} is already verified in Firebase Auth (Returning Success)`);

          // Ensure Firestore is updated too, just in case
          await UserService.updateUserVerification(uid, { email: true });

          return sendResponse(res, 200, { success: true, alreadyVerified: true }, 'Email already verified');
        }
      } catch (e) {
        debugLog(`[CONFIRM_VERIFICATION] Failed to check Auth status: ${e.message}`);
      }

      // Fallback to Firestore check
      try {
        const user = await UserService.getUserProfile(uid);
        debugLog(`[CONFIRM_VERIFICATION] User found in Firestore: verified.email=${user.verification?.email}`);

        // Check verification status in Firestore doc
        if (user.verification && user.verification.email) {
          debugLog(`[CONFIRM_VERIFICATION] User ${uid} is already verified in Firestore (Returning Success)`);
          return sendResponse(res, 200, { success: true, alreadyVerified: true }, 'Email already verified');
        } else {
          debugLog(`[CONFIRM_VERIFICATION] User ${uid} exists but is NOT verified (Returning INVALID_TOKEN)`);
        }
      } catch (userError) {
        debugLog(`[CONFIRM_VERIFICATION] Failed to check Firestore user status for ${uid}: ${userError.message}`);
      }

      return sendError(res, 400, 'INVALID_TOKEN', 'Invalid verification request - Link may have expired or been used');
    }

    const data = doc.data();
    debugLog(`[CONFIRM_VERIFICATION] Found verification doc. Token in DB: ${data.token}`);

    if (data.token !== token) {
      debugLog(`[CONFIRM_VERIFICATION] Token mismatch! Received: ${token}, DB: ${data.token}`);
      return sendError(res, 400, 'INVALID_TOKEN', 'This verification link is no longer valid. You may have requested a new one. Please check your email for the latest link.');
    }

    if (new Date(data.expiresAt) < new Date()) {
      debugLog(`[CONFIRM_VERIFICATION] Token expired. ExpiresAt: ${data.expiresAt}, Now: ${new Date()}`);
      return sendError(res, 400, 'TOKEN_EXPIRED', 'Verification token has expired');
    }

    // Update Firebase Auth
    debugLog('[CONFIRM_VERIFICATION] Updating Firebase Auth...');
    const auth = getAuth();
    await auth.updateUser(uid, { emailVerified: true });

    // Sync removed to avoid overwriting emailVerified with old value if latency
    // await UserService.syncUser(uid);

    // Update Firestore User Profile
    debugLog('[CONFIRM_VERIFICATION] Updating Firestore verification status...');
    await UserService.updateUserVerification(uid, { email: true });

    // Also update Transport Provider verification if exists or if this was a provider verification
    if (data.userType === 'transport_provider' || data.userType === 'both') {
      try {
        debugLog('[CONFIRM_VERIFICATION] Checking/Creating Transport Provider...');
        const TransportProviderService = require('../services/transportProviderService');
        // createProvider will return existing if it exists, or create new
        const provider = await TransportProviderService.createProvider(uid);

        debugLog('[CONFIRM_VERIFICATION] Syncing Provider...');
        await TransportProviderService.syncProvider(uid);
      } catch (err) {
        console.log('[CONFIRM_VERIFICATION] Not a transport provider or sync failed', err);
      }
    }

    // Delete used token
    debugLog('[CONFIRM_VERIFICATION] Deleting token doc...');
    await docRef.delete();

    debugLog('[CONFIRM_VERIFICATION] Verification successful!');
    sendResponse(res, 200, { success: true }, 'Email verified successfully');

  } catch (error) {
    debugLog(`[CONFIRM_VERIFICATION] ERROR: ${error.message}\n${error.stack}`);
    logger.error('Confirm verification failed:', error);
    sendError(res, 500, 'VERIFICATION_CONFIRM_FAILED', 'Failed to confirm verification');
  }
}));

router.post('/send-verification-email', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('verificationLink').isLength({ min: 10 }).withMessage('Valid verification link is required'),
  body('userType').optional().isIn(['passenger', 'transport_provider']).withMessage('Invalid user type'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const { email, verificationLink, userType = 'passenger' } = req.body;

  try {
    const userTypeLabel = userType === 'transport_provider' ? 'Transport Provider' : 'Passenger';

    // Create email content
    const subject = `Verify Your ${userTypeLabel} Account - TripO`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>Verify Your Email - TripO</title>
          <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1E293B; margin: 0; padding: 0; background-color: #F8FAFC; }
              .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
              .header { background: linear-gradient(135deg, #0D3B78, #1C5BA5); color: white; padding: 40px 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; font-weight: 800; }
              .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; }
              .content { padding: 40px 30px; }
              .content h2 { color: #0D3B78; margin: 0 0 20px; font-size: 24px; font-weight: 700; }
              .content p { margin: 0 0 20px; font-size: 16px; line-height: 1.6; }
              .verify-button { display: inline-block; background: linear-gradient(135deg, #0D3B78, #1C5BA5); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; margin: 20px 0; }
              .verify-button:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(13, 59, 120, 0.3); }
              .link-text { background: #F1F5F9; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 20px 0; }
              .footer { padding: 30px; background-color: #F8FAFC; text-align: center; font-size: 14px; color: #64748B; }
              .footer p { margin: 5px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <div class="badge">${userTypeLabel}</div>
                  <h1>TripO</h1>
                  <p>Welcome to the ride sharing community!</p>
              </div>
              <div class="content">
                  <h2>Verify Your Email Address</h2>
                  <p>Hi there!</p>
                  <p>Thank you for signing up as a ${userTypeLabel.toLowerCase()} with TripO. To complete your registration and start using our platform, please verify your email address by clicking the button below:</p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                      <a href="${verificationLink}" class="verify-button">Verify Email Address</a>
                  </div>
                  
                  <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                  <div class="link-text">${verificationLink}</div>
                  
                  <p><strong>Important:</strong> This verification link will expire in 24 hours for security reasons.</p>
                  
                  <p>Once verified, you'll be able to:</p>
                  <ul>
                      ${userType === 'transport_provider' ?
        '<li>Complete your transport provider profile</li><li>Add your vehicle information</li><li>Start offering rides to passengers</li><li>Earn money by sharing rides</li>' :
        '<li>Complete your passenger profile</li><li>Search and book rides</li><li>Connect with verified drivers</li><li>Enjoy safe and affordable travel</li>'
      }
                  </ul>
                  
                  <p>If you didn't create this account, please ignore this email.</p>
              </div>
              <div class="footer">
                  <p><strong>TripO Team</strong></p>
                  <p>This is an automated message. Please do not reply to this email.</p>
                  <p>&copy; 2024 TripO. All rights reserved.</p>
              </div>
          </div>
      </body>
      </html>
    `;

    const textContent = `
TripO - Verify Your Email Address

Hi there!

Thank you for signing up as a ${userTypeLabel.toLowerCase()} with TripO. To complete your registration, please verify your email address by clicking this link:

${verificationLink}

This verification link will expire in 24 hours for security reasons.

If you didn't create this account, please ignore this email.

TripO Team
© 2024 TripO. All rights reserved.
    `;

    // Send email using NotificationService
    const emailResult = await NotificationService.sendEmail(
      email,
      subject,
      htmlContent,
      textContent,
      {
        category: 'email_verification',
        userType: userType
      }
    );

    if (emailResult.success) {
      logger.info(`Verification email sent successfully to ${email} for ${userType}`);
      sendResponse(res, 200, {
        emailSent: true,
        messageId: emailResult.messageId,
        email: email
      }, 'Verification email sent successfully');
    } else {
      logger.error(`Failed to send verification email to ${email}:`, emailResult.error);
      sendError(res, 500, 'EMAIL_SEND_FAILED', `Failed to send verification email: ${emailResult.error}`);
    }

  } catch (error) {
    logger.error('Send verification email error:', error);
    sendError(res, 500, 'EMAIL_SERVICE_ERROR', `Email service error: ${error.message}`);
  }
}));
router.post('/verify-token', [
  body('token').notEmpty().withMessage('Token is required'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const { token } = req.body;

  try {
    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(token);

    // Sync user with Firestore
    const user = await UserService.syncUser(decodedToken.uid);

    // Create session
    const sessionData = await UserService.createUserSession(decodedToken.uid, {
      loginTime: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    sendResponse(res, 200, {
      user: user.toJSON(),
      session: sessionData
    }, 'Token verified successfully');
  } catch (error) {
    logger.error('Token verification failed:', error);
    sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
}));

/**
 * POST /api/auth/sync-user
 * Sync Firebase user with Firestore profile
 */
router.post('/sync-user', authenticateToken, asyncHandler(async (req, res) => {
  try {
    logger.info(`[SYNC_USER] Received request for UID: ${req.user.uid}`);
    logger.info(`[SYNC_USER] Payload: ${JSON.stringify(req.body, null, 2)}`);

    const user = await UserService.syncUser(req.user.uid, req.body);
    sendResponse(res, 200, { user: user.toJSON(), receivedPayload: req.body }, 'User synced successfully');
  } catch (error) {
    logger.error('User sync failed:', error);
    sendError(res, 500, 'SYNC_FAILED', 'Failed to sync user data');
  }
}));

/**
 * GET /api/auth/profile
 * Get current user's profile
 */
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const user = await UserService.getUserProfile(req.user.uid);
    sendResponse(res, 200, { user: user.toJSON() }, 'Profile retrieved successfully');
  } catch (error) {
    if (error.message === 'User not found') {
      logger.info(`User ${req.user.uid} not found in Firestore, syncing from Auth...`);
      try {
        const user = await UserService.syncUser(req.user.uid);
        return sendResponse(res, 200, { user: user.toJSON() }, 'Profile retrieved successfully');
      } catch (syncError) {
        logger.error('Failed to sync user during profile retrieval:', syncError);
        return sendError(res, 500, 'SYNC_FAILED', 'Failed to create user profile');
      }
    }
    logger.error('Failed to get profile:', error);
    sendError(res, 404, 'USER_NOT_FOUND', 'User profile not found');
  }
}));

/**
 * PUT /api/auth/profile
 * Update current user's profile
 */
router.put('/profile', [
  authenticateToken,
  body('name').optional().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters'),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer_not_to_say']).withMessage('Invalid gender'),
  body('avatar').optional(), // Validation relaxed to allow localhost/custom URLs without issues
  body('phone').optional().isLength({ min: 10, max: 20 }).withMessage('Phone must be 10-20 characters'),
  body('location.village').optional().isLength({ min: 1, max: 100 }).withMessage('Village must be 1-100 characters'),
  body('location.wadi').optional().isLength({ max: 100 }).withMessage('Wadi must be less than 100 characters'),
  body('location.district').optional().isLength({ min: 1, max: 100 }).withMessage('District must be 1-100 characters'),
  body('location.state').optional().isLength({ min: 1, max: 100 }).withMessage('State must be 1-100 characters'),
  body('location.country').optional().isLength({ min: 1, max: 100 }).withMessage('Country must be 1-100 characters'),
  body('location.street').optional().isLength({ max: 200 }).withMessage('Street must be less than 200 characters'),
  body('location.city').optional().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
  body('location.fullAddress').optional().isLength({ max: 500 }).withMessage('Full address must be less than 500 characters'),
  body('onboardingCompleted').optional().isBoolean().withMessage('Onboarding completed must be boolean'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const { name, bio, dateOfBirth, gender, avatar, phone, location, onboardingCompleted } = req.body;

    const profileData = {};
    if (name !== undefined) profileData.name = name;
    if (bio !== undefined) profileData.bio = bio;
    if (dateOfBirth !== undefined) profileData.dateOfBirth = new Date(dateOfBirth);
    if (gender !== undefined) profileData.gender = gender;
    if (avatar !== undefined) profileData.avatar = avatar;
    if (phone !== undefined) profileData.phone = phone;
    if (location !== undefined) profileData.location = location;
    if (onboardingCompleted !== undefined) profileData.onboardingCompleted = onboardingCompleted;

    const user = await UserService.updateUserProfile(req.user.uid, profileData);
    sendResponse(res, 200, { user: user.toJSON() }, 'Profile updated successfully');
  } catch (error) {
    logger.error('Failed to update profile:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update profile');
  }
}));

/**
 * PUT /api/auth/role
 * Update user role (passenger, provider, both)
 */
router.put('/role', [
  authenticateToken,
  body('role').isIn(['passenger', 'provider', 'both']).withMessage('Invalid role'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const { role } = req.body;
    const user = await UserService.updateUserRole(req.user.uid, role);
    sendResponse(res, 200, { user: user.toJSON() }, 'Role updated successfully');
  } catch (error) {
    logger.error('Failed to update role:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update role');
  }
}));

/**
 * PUT /api/auth/preferences
 * Update user preferences
 */
router.put('/preferences', [
  authenticateToken,
  body('smoking').optional().isBoolean().withMessage('Smoking must be boolean'),
  body('pets').optional().isBoolean().withMessage('Pets must be boolean'),
  body('music').optional().isBoolean().withMessage('Music must be boolean'),
  body('conversation').optional().isIn(['love_to_chat', 'depends_on_mood', 'prefer_quiet']).withMessage('Invalid conversation preference'),
  body('autoApproveBookings').optional().isBoolean().withMessage('Auto approve bookings must be boolean'),
  body('notifications.email').optional().isBoolean().withMessage('Email notifications must be boolean'),
  body('notifications.sms').optional().isBoolean().withMessage('SMS notifications must be boolean'),
  body('notifications.push').optional().isBoolean().withMessage('Push notifications must be boolean'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const preferencesData = req.body;
    const user = await UserService.updateUserPreferences(req.user.uid, preferencesData);
    sendResponse(res, 200, { user: user.toJSON() }, 'Preferences updated successfully');
  } catch (error) {
    logger.error('Failed to update preferences:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update preferences');
  }
}));

/**
 * PUT /api/auth/verification
 * Update user verification status (admin only for now)
 */
router.put('/verification', [
  authenticateToken,
  body('identity').optional().isBoolean().withMessage('Identity verification must be boolean'),
  body('drivingLicense').optional().isBoolean().withMessage('Driving license verification must be boolean'),
  body('backgroundCheck').optional().isBoolean().withMessage('Background check must be boolean'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    // For now, allow users to update their own verification status
    // In production, this should be restricted to admin users or verification service
    const verificationData = req.body;
    const user = await UserService.updateUserVerification(req.user.uid, verificationData);
    sendResponse(res, 200, { user: user.toJSON() }, 'Verification status updated successfully');
  } catch (error) {
    logger.error('Failed to update verification:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update verification status');
  }
}));

/**
 * POST /api/auth/logout
 * Logout user and clear session
 */
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  try {
    await UserService.deleteUserSession(req.user.uid);
    sendResponse(res, 200, null, 'Logged out successfully');
  } catch (error) {
    logger.error('Failed to logout:', error);
    sendError(res, 500, 'LOGOUT_FAILED', 'Failed to logout');
  }
}));

/**
 * GET /api/auth/session
 * Get current session info
 */
router.get('/session', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const sessionData = await UserService.getUserSession(req.user.uid);
    sendResponse(res, 200, { session: sessionData }, 'Session retrieved successfully');
  } catch (error) {
    logger.error('Failed to get session:', error);
    sendError(res, 500, 'SESSION_ERROR', 'Failed to retrieve session');
  }
}));

module.exports = router;