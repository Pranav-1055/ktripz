const fetch = require('node-fetch');

async function test() {
    try {
        const response = await fetch('http://localhost:3000/api/auth/initiate-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test_agent_check@example.com',
                uid: 'test_uid_agent',
                userType: 'passenger'
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Body:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
