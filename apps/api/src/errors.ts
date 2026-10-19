/**
 * Failures the player should hear about, with the HTTP status to send. Thrown
 * anywhere in the game logic; `app.ts` turns them into `{ error }` responses.
 * Kept free of Node imports so `app.ts` can use it.
 */
export class GameError extends Error {
  // Spelled out rather than `constructor(readonly status ...)`: that shorthand
  // needs compiling, and Node runs this file as it is.
  readonly status: 403 | 404 | 409 | 429 | 503;

  constructor(status: 403 | 404 | 409 | 429 | 503, message: string) {
    super(message);
    this.status = status;
  }
}
