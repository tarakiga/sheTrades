import type { AuthStatusMessage } from "./types";

export type AuthStatusBannerProps = {
  message: AuthStatusMessage | null;
};

export function AuthStatusBanner({ message }: AuthStatusBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <section className={`auth-status auth-status--${message.tone}`} role="status" aria-live="polite">
      <p className="auth-status__title">{message.title}</p>
      {message.description ? <p className="auth-status__description">{message.description}</p> : null}
    </section>
  );
}
