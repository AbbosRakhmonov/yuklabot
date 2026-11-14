import { MESSAGES } from "@/constants";

/**
 * Error whose message is safe to show to the user.
 * Any other error is shown as a generic message and only logged in full.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export const getUserErrorMessage = (error: unknown): string =>
  error instanceof UserError ? error.message : MESSAGES.ERROR.GENERIC;
