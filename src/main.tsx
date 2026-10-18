import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { getAuthConfig } from "./features/twitch-auth/oauth";
import type { AuthConfig } from "./features/twitch-auth/oauth";
import { createAuthSession } from "./features/twitch-auth/session";

let config: AuthConfig | undefined;
let configurationError: string | undefined;
try {
  config = getAuthConfig(
    import.meta.env.VITE_TWITCH_CLIENT_ID,
    import.meta.env.VITE_TWITCH_REDIRECT_URI,
  );
} catch (error) {
  configurationError =
    error instanceof Error
      ? error.message
      : "Twitch の設定を確認してください。";
}

const session = createAuthSession({
  config,
  configurationError,
  storage: () => window.sessionStorage,
  readUrl: () => new URL(window.location.href),
  replaceUrl: (url) => window.history.replaceState(null, "", url),
  navigate: (url) => window.location.assign(url),
});

// Start once outside React: StrictMode must not consume the OAuth callback twice.
void session.start();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("アプリの表示先が見つかりません。");
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <App session={session} config={config} />
  </StrictMode>,
);

const handleVisibility = () => {
  if (document.visibilityState === "visible") void session.refresh();
};
const handlePageHide = () => session.dispose();
document.addEventListener("visibilitychange", handleVisibility);
window.addEventListener("pagehide", handlePageHide);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", handlePageHide);
    session.dispose();
    root.unmount();
  });
}
