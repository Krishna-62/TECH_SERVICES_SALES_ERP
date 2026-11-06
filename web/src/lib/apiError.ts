// status 0 means the request never reached the server: no signal, or the server is down.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: unknown
  ) {
    super(message);
  }
}

export const OFFLINE_MESSAGE = 'You’re offline, and this isn’t saved on this device yet.';
