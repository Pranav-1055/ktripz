const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const TO_EMAIL = 'nigel@example.com'; // Replace with a real email if needed, or check logs

console.log('Testing SendGrid Integration...');
console.log('API Key present:', !!API_KEY);
console.log('From Email:', FROM_EMAIL);

if (!API_KEY) {
    console.error('ERROR: SENDGRID_API_KEY is missing in .env');
    process.exit(1);
}

sgMail.setApiKey(API_KEY);

const msg = {
    to: TO_EMAIL,
    from: FROM_EMAIL,
    subject: 'TripO Email Test',
    text: 'This is a test email from TripO backend debugging script.',
    html: '<strong>This is a test email from TripO backend debugging script.</strong>',
};

(async () => {
    try {
        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:');
        console.error(error);
        if (error.response) {
            console.error('SendGrid Response Body:', error.response.body);
        }
    }
})();
