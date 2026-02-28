import React from 'react';

export function Input({
    label,
    error,
    icon: Icon,
    className = '',
    containerClassName = '',
    ...props
}) {
    return (
        <div className={`mb-4 ${containerClassName}`}>
            {label && (
                <label className="block text-sm font-bold text-text-dark mb-2 ml-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <input
                    className={`
            w-full h-[56px] bg-[#F1F5F9] border-2 border-transparent rounded-xl px-4 text-base text-text-dark transition-all duration-200
            focus:outline-none focus:bg-white focus:border-primary focus:shadow-[0_0_0_4px_rgba(13,59,120,0.1)]
            placeholder:text-text-soft/50
            ${error ? 'border-error bg-error/5 focus:border-error focus:shadow-[0_0_0_4px_rgba(239,68,68,0.1)]' : ''}
            ${Icon ? 'pl-12' : ''}
            ${className}
          `}
                    {...props}
                />
                {Icon && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-soft pointer-events-none">
                        <Icon size={20} />
                    </div>
                )}
            </div>
            {error && (
                <p className="mt-2 text-sm text-error font-medium ml-1 animate-fade-in-up">
                    {error}
                </p>
            )}
        </div>
    );
}
