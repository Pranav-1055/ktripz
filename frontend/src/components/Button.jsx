import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
    children,
    variant = 'primary',
    isLoading = false,
    className = '',
    disabled,
    ...props
}) {
    const baseStyles = "w-full h-[58px] rounded-xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-secondary",
        secondary: "bg-secondary text-white hover:bg-primary",
        outline: "border-2 border-border bg-transparent text-text-dark hover:border-primary hover:text-primary",
        ghost: "bg-transparent text-text-soft hover:text-primary hover:bg-primary/5"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
            {children}
        </button>
    );
}
