const { getFirestore, getDatabase } = require('../config/firebase');
const logger = require('../utils/logger');

class Message {
  constructor(data) {
    this.id = data.id;
    this.conversationId = data.conversationId; // bookingId or custom conversation ID
    this.fromUserId = data.fromUserId;
    this.toUserId = data.toUserId;
    this.content = data.content;
    this.type = data.type || 'text'; // text, photo, location, template
    this.metadata = data.metadata || {}; // Additional data for photos, locations, etc.
    this.isRead = data.isRead || false;
    this.isDelivered = data.isDelivered || false;
    this.isTemplate = data.isTemplate || false;
    this.templateType = data.templateType || null; // pickup_reminder, arrival_notification, etc.
    this.createdAt = data.createdAt || new Date();
    this.readAt = data.readAt || null;
    this.deliveredAt = data.deliveredAt || null;
  }

  /**
   * Save message to both Firestore and Realtime Database
   */
  async save() {
    try {
      const db = getFirestore();
      const realtimeDb = getDatabase();
      
      let messageRef;
      
      if (this.id) {
        messageRef = db.collection('messages').doc(this.id);
      } else {
        messageRef = db.collection('messages').doc();
        this.id = messageRef.id;
      }
      
      const messageData = this.toJSON();
      
      // Save to Firestore for persistence
      await messageRef.set(messageData, { merge: true });
      
      // Save to Realtime Database for real-time updates
      const realtimeRef = realtimeDb.ref(`conversations/${this.conversationId}/messages/${this.id}`);
      await realtimeRef.set(messageData);
      
      // Update conversation metadata
      const conversationRef = realtimeDb.ref(`conversations/${this.conversationId}/metadata`);
      await conversationRef.update({
        lastMessage: {
          content: this.content,
          type: this.type,
          fromUserId: this.fromUserId,
          createdAt: this.createdAt.toISOString()
        },
        lastActivity: new Date().toISOString(),
        [`unreadCount_${this.toUserId}`]: (await conversationRef.child(`unreadCount_${this.toUserId}`).once('value')).val() + 1 || 1
      });
      
      logger.info(`Message saved: ${this.id} in conversation: ${this.conversationId}`);
      return this;
    } catch (error) {
      logger.error('Error saving message:', error);
      throw error;
    }
  }

  /**
   * Create a new message
   */
  static async create(messageData) {
    try {
      const message = new Message(messageData);
      await message.save();
      return message;
    } catch (error) {
      logger.error('Error creating message:', error);
      throw error;
    }
  }

  /**
   * Get messages for a conversation
   */
  static async getConversationMessages(conversationId, options = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('messages')
        .where('conversationId', '==', conversationId)
        .orderBy('createdAt', 'desc');

      // Pagination
      const limit = parseInt(options.limit) || 50;
      query = query.limit(limit);

      if (options.before) {
        const beforeDate = new Date(options.before);
        query = query.where('createdAt', '<', beforeDate);
      }

      const querySnapshot = await query.get();
      const messages = [];

      querySnapshot.forEach(doc => {
        messages.push(new Message(doc.data()));
      });

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Error getting conversation messages:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead() {
    try {
      if (this.isRead) {
        return this;
      }

      this.isRead = true;
      this.readAt = new Date();

      const db = getFirestore();
      const realtimeDb = getDatabase();

      // Update in Firestore
      await db.collection('messages').doc(this.id).update({
        isRead: true,
        readAt: this.readAt
      });

      // Update in Realtime Database
      const realtimeRef = realtimeDb.ref(`conversations/${this.conversationId}/messages/${this.id}`);
      await realtimeRef.update({
        isRead: true,
        readAt: this.readAt.toISOString()
      });

      // Decrease unread count
      const conversationRef = realtimeDb.ref(`conversations/${this.conversationId}/metadata`);
      const currentUnreadCount = (await conversationRef.child(`unreadCount_${this.toUserId}`).once('value')).val() || 0;
      await conversationRef.update({
        [`unreadCount_${this.toUserId}`]: Math.max(0, currentUnreadCount - 1)
      });

      logger.info(`Message marked as read: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Error marking message as read:', error);
      throw error;
    }
  }

  /**
   * Mark message as delivered
   */
  async markAsDelivered() {
    try {
      if (this.isDelivered) {
        return this;
      }

      this.isDelivered = true;
      this.deliveredAt = new Date();

      const db = getFirestore();
      const realtimeDb = getDatabase();

      // Update in Firestore
      await db.collection('messages').doc(this.id).update({
        isDelivered: true,
        deliveredAt: this.deliveredAt
      });

      // Update in Realtime Database
      const realtimeRef = realtimeDb.ref(`conversations/${this.conversationId}/messages/${this.id}`);
      await realtimeRef.update({
        isDelivered: true,
        deliveredAt: this.deliveredAt.toISOString()
      });

      logger.info(`Message marked as delivered: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Error marking message as delivered:', error);
      throw error;
    }
  }

  /**
   * Get user's conversations
   */
  static async getUserConversations(userId, options = {}) {
    try {
      const realtimeDb = getDatabase();
      const conversationsRef = realtimeDb.ref('conversations');
      
      // Get all conversations where user is participant
      const snapshot = await conversationsRef.once('value');
      const allConversations = snapshot.val() || {};
      
      const userConversations = [];
      
      for (const [conversationId, conversationData] of Object.entries(allConversations)) {
        const metadata = conversationData.metadata || {};
        
        // Check if user is participant in this conversation
        if (conversationId.includes(userId) || 
            (metadata.participants && metadata.participants.includes(userId))) {
          
          userConversations.push({
            conversationId,
            metadata: {
              ...metadata,
              unreadCount: metadata[`unreadCount_${userId}`] || 0
            }
          });
        }
      }

      // Sort by last activity
      userConversations.sort((a, b) => {
        const aTime = new Date(a.metadata.lastActivity || 0);
        const bTime = new Date(b.metadata.lastActivity || 0);
        return bTime - aTime;
      });

      return userConversations;
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      throw error;
    }
  }

  /**
   * Create automated message templates
   */
  static async createTemplate(templateType, conversationId, fromUserId, toUserId, templateData = {}) {
    try {
      const templates = {
        booking_confirmed: {
          content: `Your booking has been confirmed! 🎉 Looking forward to the trip. Feel free to message me if you have any questions.`,
          type: 'text'
        },
        pickup_reminder: {
          content: `Hi! Just a reminder that our trip is starting in ${templateData.timeUntilPickup || '30 minutes'}. I'll be at ${templateData.pickupLocation || 'the pickup point'} at ${templateData.pickupTime || 'the scheduled time'}. See you soon!`,
          type: 'text'
        },
        arrival_notification: {
          content: `I've arrived at the pickup point! 🚗 Look for a ${templateData.vehicleColor || 'car'} ${templateData.vehicleMake || ''} ${templateData.vehicleModel || ''} (${templateData.licensePlate || 'license plate'}).`,
          type: 'text'
        },
        trip_started: {
          content: `Trip started! 🚗 Estimated arrival time: ${templateData.estimatedArrival || 'as scheduled'}. Have a great journey!`,
          type: 'text'
        },
        trip_completed: {
          content: `Trip completed successfully! 🎯 Thank you for traveling with me. Don't forget to rate your experience!`,
          type: 'text'
        },
        payment_reminder: {
          content: `Hi! Just a friendly reminder that payment for the trip is still pending. Please complete the payment when convenient. Thanks!`,
          type: 'text'
        },
        cancellation_notice: {
          content: `Unfortunately, I need to cancel our trip due to ${templateData.reason || 'unforeseen circumstances'}. Sorry for the inconvenience. You'll receive a full refund shortly.`,
          type: 'text'
        },
        pickup_coordination: {
          content: `I'm ${templateData.driverLocation || 'nearby'} and will arrive at ${templateData.pickupLocation || 'the pickup point'} in approximately ${templateData.estimatedArrival || '5 minutes'}. Please be ready at ${templateData.pickupTime || 'the scheduled time'}!`,
          type: 'text'
        }
      };

      const template = templates[templateType];
      if (!template) {
        throw new Error(`Unknown template type: ${templateType}`);
      }

      const message = new Message({
        conversationId,
        fromUserId,
        toUserId,
        content: template.content,
        type: template.type,
        isTemplate: true,
        templateType,
        metadata: templateData
      });

      await message.save();
      logger.info(`Template message created: ${templateType} for conversation: ${conversationId}`);
      return message;
    } catch (error) {
      logger.error('Error creating template message:', error);
      throw error;
    }
  }

  /**
   * Archive conversation
   */
  static async archiveConversation(conversationId, userId) {
    try {
      const realtimeDb = getDatabase();
      const conversationRef = realtimeDb.ref(`conversations/${conversationId}/metadata`);
      
      await conversationRef.update({
        [`archived_${userId}`]: true,
        [`archivedAt_${userId}`]: new Date().toISOString()
      });

      logger.info(`Conversation archived: ${conversationId} by user: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error archiving conversation:', error);
      throw error;
    }
  }

  /**
   * Delete message (soft delete)
   */
  async delete(deletedByUserId) {
    try {
      const db = getFirestore();
      const realtimeDb = getDatabase();

      // Soft delete in Firestore
      await db.collection('messages').doc(this.id).update({
        isDeleted: true,
        deletedBy: deletedByUserId,
        deletedAt: new Date()
      });

      // Update in Realtime Database
      const realtimeRef = realtimeDb.ref(`conversations/${this.conversationId}/messages/${this.id}`);
      await realtimeRef.update({
        isDeleted: true,
        deletedBy: deletedByUserId,
        deletedAt: new Date().toISOString()
      });

      logger.info(`Message deleted: ${this.id} by user: ${deletedByUserId}`);
      return this;
    } catch (error) {
      logger.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Get conversation statistics
   */
  static async getConversationStats(conversationId) {
    try {
      const db = getFirestore();
      const messagesQuery = db.collection('messages')
        .where('conversationId', '==', conversationId);

      const snapshot = await messagesQuery.get();
      
      let totalMessages = 0;
      let unreadMessages = 0;
      let lastMessage = null;
      let participants = new Set();

      snapshot.forEach(doc => {
        const message = doc.data();
        totalMessages++;
        
        if (!message.isRead) {
          unreadMessages++;
        }
        
        if (!lastMessage || message.createdAt > lastMessage.createdAt) {
          lastMessage = message;
        }
        
        participants.add(message.fromUserId);
        participants.add(message.toUserId);
      });

      return {
        conversationId,
        totalMessages,
        unreadMessages,
        lastMessage,
        participants: Array.from(participants),
        lastActivity: lastMessage?.createdAt || null
      };
    } catch (error) {
      logger.error('Error getting conversation stats:', error);
      throw error;
    }
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      fromUserId: this.fromUserId,
      toUserId: this.toUserId,
      content: this.content,
      type: this.type,
      metadata: this.metadata,
      isRead: this.isRead,
      isDelivered: this.isDelivered,
      isTemplate: this.isTemplate,
      templateType: this.templateType,
      createdAt: this.createdAt,
      readAt: this.readAt,
      deliveredAt: this.deliveredAt
    };
  }
}

module.exports = Message;