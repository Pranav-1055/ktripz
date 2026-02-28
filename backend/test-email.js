const axios = require('axios');

async function testEmail() {
    try {
        console.log('Sending test email trigger...');
        const response = await axios.post('http://localhost:3000/api/auth/initiate-verification', {
            email: 'test_agent_check@example.com',
            uid: 'test_uid_agent_' + Date.now(),
            userType: 'passenger'
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('Response status:', response.status);
        console.log('Response data:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('Error response:', error.response.status, error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testEmail();
