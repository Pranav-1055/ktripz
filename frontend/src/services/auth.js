import { api } from './api';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { app } from '../config/firebase';

const auth = getAuth(app);

export const authService = {
    async register(email, password, role = 'passenger', additionalData = {}) {
        let user;
        let token;
        let isNewUser = true;

        try {
            // 1. Try to create user in Firebase Auth
            // 1. Try to create user in Firebase Auth
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                user = userCredential.user;
                token = await user.getIdToken();
            } catch (createError) {
                // If email already in use, try to sign in (to allow role addition)
                if (createError.code === 'auth/email-already-in-use') {
                    try {
                        const userCredential = await signInWithEmailAndPassword(auth, email, password);
                        user = userCredential.user;
                        token = await user.getIdToken();
                        isNewUser = false;
                    } catch (signInError) {
                        // If password wrong or invalid credential, let user know they have an account but password didn't match
                        if (signInError.code === 'auth/wrong-password' || signInError.code === 'auth/invalid-credential') {
                            throw new Error('This email is already registered. To add this role, please use your existing password.');
                        }
                        throw createError; // Throw original error if we can't sign in for other reasons
                    }
                } else {
                    throw createError;
                }
            }

            // 2. Initiate verification and Sync User
            try {
                // Initiate verification via Backend (NodeMailer) - for new users OR existing unverified users
                if (isNewUser || !user.emailVerified) {
                    await api.post('/auth/initiate-verification', {
                        email,
                        uid: user.uid,
                        userType: role
                    });
                }

                // 3. User Sync (Common for all roles) - Updates role in users collection if needed
                // If existing user, this might overwrite/merge data. existing backend logic handles merges usually.
                await api.post('/auth/sync-user', {
                    ...additionalData,
                    role // ensure role is passed if not in additionalData
                }, token);

                // 4. Register transport provider if needed
                if (role === 'transport_provider') {
                    await api.post('/transport-providers/register', {
                        token,
                        ...additionalData
                    });
                }
            } catch (error) {
                // ROLLBACK: If backend sync fails for a NEW user, delete the Firebase Auth user
                // so the user can try registering again without "Email already in use" error.
                if (isNewUser && user) {
                    try {
                        console.warn('Registration failed during backend sync. Rolling back Firebase user...');
                        await user.delete();
                        console.log('Rollback successful: Firebase user deleted.');
                    } catch (deleteError) {
                        console.error('CRITICAL: Failed to rollback user creation after backend error:', deleteError);
                        // We intentionally don't throw deleteError so the original error is what the user sees
                    }
                }
                throw error; // Re-throw the original error (e.g., network error, 500)
            }

            return user;
        } catch (error) {
            throw error;
        }
    },

    async verifyEmail(token, uid) {
        return await api.post('/auth/confirm-verification', { token, uid });
    },

    async login(email, password) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Force refresh to get latest claims/status
        await user.reload();

        if (!user.emailVerified) {
            throw new Error('Please verify your email address before logging in.');
        }

        const token = await user.getIdToken();
        localStorage.setItem('token', token);

        return user;
    },

    async logout() {
        await signOut(auth);
        localStorage.removeItem('token');
    },

    async getUserRole(uid) {
        try {
            await this.waitForAuth();
            const user = auth.currentUser;
            const token = user ? await user.getIdToken() : null;
            const response = await api.get(`/users/${uid}`, token);
            return response.user?.role || 'passenger';
        } catch (error) {
            console.error('Failed to fetch user role:', error);
            return 'passenger';
        }
    },

    async updateRole(role) {
        await this.waitForAuth();
        const user = auth.currentUser;
        if (!user) throw new Error('No authenticated user');
        const token = await user.getIdToken();

        // We use sync-user to update/ensure role 
        return await api.post('/auth/sync-user', { role }, token);
    },

    async getProfile() {
        await this.waitForAuth();
        const user = auth.currentUser;
        if (!user) throw new Error('No authenticated user');
        const token = await user.getIdToken();
        return await api.get('/auth/profile', token);
    },

    async getToken() {
        const user = auth.currentUser;
        if (!user) return localStorage.getItem('token'); // Fallback to stored token
        const token = await user.getIdToken();
        localStorage.setItem('token', token); // Refresh stored token
        return token;
    },

    waitForAuth() {
        return new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe();
                resolve(user);
            });
        });
    }
};
