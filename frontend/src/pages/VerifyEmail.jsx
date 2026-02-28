import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { authService } from '../services/auth';

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const uid = searchParams.get('uid');
    const navigate = useNavigate();

    const [status, setStatus] = useState('verifying'); // verifying, success, error
    const [message, setMessage] = useState('Verifying your email...');

    const verificationAttempted = React.useRef(false);

    useEffect(() => {
        if (!token || !uid) {
            setStatus('error');
            setMessage('Invalid verification link.');
            return;
        }

        if (verificationAttempted.current) return;
        verificationAttempted.current = true;

        const verify = async () => {
            try {
                const response = await authService.verifyEmail(token, uid);
                setStatus('success');
                if (response.alreadyVerified) {
                    setMessage('Your email was already verified. You can log in now.');
                } else {
                    setMessage('Your email has been verified successfully!');
                }
            } catch (error) {
                console.error('Verification error:', error);
                // If it's a 400 because it was already verified (race condition), we might want to treat it as success or specific message
                // But preventing double call is better.
                setStatus('error');
                setMessage(error.message || 'Verification failed. Link may be expired.');
            }
        };

        verify();
    }, [token, uid]);

    return (
        <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in-up">
            <Card className="w-full max-w-md text-center">
                <div className={`
          w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6
          ${status === 'verifying' ? 'bg-blue-50 text-primary' : ''}
          ${status === 'success' ? 'bg-green-50 text-success' : ''}
          ${status === 'error' ? 'bg-red-50 text-error' : ''}
        `}>
                    {status === 'verifying' && <Loader2 size={40} className="animate-spin" />}
                    {status === 'success' && <CheckCircle size={40} />}
                    {status === 'error' && <XCircle size={40} />}
                </div>

                <h2 className="text-2xl font-bold text-text-dark mb-3">
                    {status === 'verifying' ? 'Verifying...' : status === 'success' ? 'Verified!' : 'Verification Failed'}
                </h2>

                <p className="text-text-soft mb-8">
                    {message}
                </p>

                {status !== 'verifying' && (
                    <Button onClick={() => navigate('/login')}>
                        Continue to Login
                    </Button>
                )}
            </Card>
        </div>
    );
}
