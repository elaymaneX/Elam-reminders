import webpush from 'web-push';

let configured = false;

export function getWebPush() {
  if (!configured) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:example@example.com';
    if (!publicKey || !privateKey) {
      throw new Error('VAPID keys are missing. Generate with: npx web-push generate-vapid-keys');
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return webpush;
}
