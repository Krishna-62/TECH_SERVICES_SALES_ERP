import { api } from './api';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

// Asks the phone's permission, then tells the server where to reach this device.
export async function enablePush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this app. Allow them in the phone’s settings.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api.notifications.subscribe(subscription.toJSON());
}

export async function disablePush() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await api.notifications.unsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}
