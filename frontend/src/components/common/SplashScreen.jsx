import React, { useEffect, useState } from 'react';

const SplashScreen = ({ onFinish }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Start the exit animation a bit before the parent unmounts/hides it
        const timer = setTimeout(() => {
            setIsVisible(false);
            // Wait for the exit animation to finish before calling onFinish
            setTimeout(onFinish, 500);
        }, 2500); // Show splash for 2.5 seconds

        return () => clearTimeout(timer);
    }, [onFinish]);

    return (
        <div
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-blue-700 to-sky-400 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
        >
            <div className="relative flex flex-col items-center">
                {/* Animated Logo/Icon Container */}
                <div className="mb-8 p-6 bg-white rounded-full shadow-2xl animate-bounce-slow">
                    {/* Simple SVG Logo Placeholder - Car/Trip Icon */}
                    <svg
                        className="w-16 h-16 text-blue-800"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg>
                </div>

                {/* Text Animation */}
                <h1 className="text-5xl font-extrabold text-white tracking-tight animate-fade-in-up">
                    TripO
                </h1>
                <p className="mt-4 text-blue-100 text-lg font-medium animate-pulse">
                    Your Journey, Your Way
                </p>
            </div>

            {/* Loading Indicator */}
            <div className="absolute bottom-10">
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin opacity-75"></div>
            </div>

            {/* Decorative background shapes */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-x-1/2 -translate-y-1/2 filter blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-900 opacity-10 rounded-full translate-x-1/3 translate-y-1/3 filter blur-3xl"></div>
        </div>
    );
};

export default SplashScreen;
