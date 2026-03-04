import React from 'react';

export function Card({ children, className = '', ...props }) {
    return (
        <div
            className={`bg-surface p-6 md:p-10 rounded-[28px] shadow-card border border-white/50 ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}
