import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export function VehicleSelect({ label, value, onChange, options, placeholder, error, name }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    const filteredOptions = options ? options.filter(option =>
        (option.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    ) : [];

    const selectedOption = options ? options.find(option => option.name === value || option.id === value) : null;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (option) => {
        // Return standard event object
        const event = {
            target: {
                name: name,
                value: option.name, // Use name as value for display
                // Pass full object for parent to use if needed (e.g. image)
                data: option
            }
        };
        onChange(event);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className="space-y-1" ref={dropdownRef}>
            {label && <label className="block text-sm font-bold text-text-dark mb-2 ml-1">{label}</label>}

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full h-[56px] bg-[#F1F5F9] border-2 rounded-xl px-4 flex items-center justify-between transition-all duration-200 ${error ? 'border-error bg-error/5' : isOpen ? 'border-primary bg-white' : 'border-transparent'
                        }`}
                >
                    {selectedOption ? (
                        <div className="flex items-center gap-3">
                            {selectedOption.image && (
                                <img
                                    src={selectedOption.image}
                                    alt={selectedOption.name}
                                    className="w-10 h-6 object-cover rounded"
                                />
                            )}
                            <span className="text-text-dark font-medium">{selectedOption.name}</span>
                        </div>
                    ) : (
                        <span className="text-text-soft">{placeholder || 'Select vehicle'}</span>
                    )}
                    <ChevronDown size={20} className={`text-text-soft transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in">
                        <div className="p-2 border-b border-gray-100">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search vehicle..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/20"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="max-h-60 overflow-y-auto">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleSelect(option)}
                                        className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${value === option.name ? 'bg-blue-50' : ''
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-8 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                                                <img
                                                    src={option.image || `https://placehold.co/100x60?text=${(option.name || '').charAt(0)}`}
                                                    alt={option.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <div className="text-left">
                                                <p className={`text-sm font-medium ${value === option.name ? 'text-blue-700' : 'text-gray-900'}`}>
                                                    {option.name}
                                                </p>
                                                {option.make && <p className="text-xs text-gray-500">{option.make}</p>}
                                            </div>
                                        </div>
                                        {value === option.name && <Check size={16} className="text-blue-600" />}
                                    </button>
                                ))
                            ) : (
                                <div className="p-4 text-center text-sm text-gray-500">
                                    No vehicles found
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {error && <p className="mt-2 text-sm text-error font-medium ml-1">{error}</p>}
        </div>
    );
}
