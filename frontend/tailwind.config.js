/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#0D3B78',
                secondary: '#1C5BA5',
                accent: '#2B6CB0',
                bg: '#F3F5F8',
                surface: '#FFFFFF',
                border: '#D5DCE5',
                'text-dark': '#1E2A38',
                'text-soft': '#6B7C93',
                error: '#EF4444',
                success: '#10B981',
            },
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            },
            borderRadius: {
                '2xl': '24px',
                'xl': '18px',
            },
            boxShadow: {
                'card': '0 10px 25px -5px rgba(13, 59, 120, 0.1)',
            }
        },
    },
    plugins: [],
}
