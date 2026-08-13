export class AppError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: AppError['status'], code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
