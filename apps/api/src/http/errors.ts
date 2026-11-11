export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
export const forbidden = (message = "You do not have permission to do that.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const unauthenticated = () => new HttpError(401, "unauthenticated", "Please sign in.");
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const badRequest = (message: string) => new HttpError(400, "invalid", message);
