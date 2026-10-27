import type { Request } from 'express';

/* Error con código HTTP y un mensaje que se le puede mostrar a la persona. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Row = Record<string, unknown>;
export type AuthedRequest = Request & { userId?: string };
