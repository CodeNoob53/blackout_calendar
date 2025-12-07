import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Paste these keys into your .env file:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`);
