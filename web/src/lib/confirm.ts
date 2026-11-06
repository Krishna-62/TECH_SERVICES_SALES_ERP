// Lets code outside React ask a yes/no question. ConfirmHost in the app shell shows it.
type Ask = (message: string, action: string) => Promise<boolean>;

let host: Ask | null = null;

export function setConfirmHost(ask: Ask | null) {
  host = ask;
}

export function askConfirm(message: string, action: string) {
  return host ? host(message, action) : Promise.resolve(false);
}
