import { useSyncExternalStore } from "react";
import type { AuthConfig } from "./features/twitch-auth/oauth";
import type { AuthSession } from "./features/twitch-auth/session";
import Roulette from "./features/roulette/Roulette";
import "./App.css";

interface AppProps {
  session: AuthSession;
  config?: AuthConfig;
}

function App({ session, config }: AppProps) {
  const auth = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return (
    <main className="auth-page">
      <header>
        <p className="eyebrow">TWITCH ROULETTE</p>
        <h1>
          {auth.status === "authenticated" ? "ルーレット" : "Twitch と接続"}
        </h1>
        <p>
          {auth.status === "authenticated"
            ? "対象報酬を選んで受付を開始すると、交換した視聴者をルーレットに登録できます。"
            : "配信者のアカウントでログインして、ルーレットの準備を始めましょう。"}
        </p>
      </header>

      {auth.status === "authenticated" ? (
        <Roulette
          key={auth.user.userId}
          userId={auth.user.userId}
          session={session}
        />
      ) : null}

      <section className="auth-card" aria-labelledby="auth-heading">
        <h2 id="auth-heading">配信者アカウント</h2>
        <div aria-live="polite" aria-atomic="true">
          {auth.status === "authenticated" ? (
            <>
              <p className="status">認証済み</p>
              <p className="identity">{auth.user.login}</p>
              <p>Twitch ユーザー ID: {auth.user.userId}</p>
            </>
          ) : auth.status === "loading" ? (
            <p role="status">認証を確認しています…</p>
          ) : auth.status === "error" ? (
            <p className="auth-error" role="alert">
              {auth.message}
            </p>
          ) : (
            <p>まだログインしていません。</p>
          )}
        </div>

        {auth.status === "authenticated" ? (
          <button type="button" onClick={session.logout}>
            ログアウト
          </button>
        ) : (
          <button
            type="button"
            onClick={session.login}
            disabled={!config || auth.status === "loading"}
          >
            Twitch でログイン
          </button>
        )}
        <p className="caption">
          チャンネルポイント報酬の読み取り権限を使用します。
        </p>
      </section>

      {!config ? (
        <section className="setup" aria-labelledby="setup-heading">
          <h2 id="setup-heading">初期設定</h2>
          <p>
            <code>.env.example</code> を <code>.env.local</code>{" "}
            にコピーし、次の値を設定して開発サーバーを再起動してください。
          </p>
          <ul>
            <li>
              <code>VITE_TWITCH_CLIENT_ID</code>: Twitch アプリの Client ID
            </li>
            <li>
              <code>VITE_TWITCH_REDIRECT_URI</code>: Twitch に登録した戻り先 URL
            </li>
          </ul>
          <p>詳しい手順はプロジェクトの README を参照してください。</p>
        </section>
      ) : (
        <p className="redirect">
          登録する戻り先 URL: <code>{config.redirectUri}</code>
        </p>
      )}

      <footer>
        <p>
          認証情報はこの画面のメモリ内でのみ保持します。再読み込みや有効期限切れの際は、再ログインしてください。
        </p>
        <p>
          他のブラウザや OBS ブラウザソースには状態を共有しません。OBS
          ではこの画面をキャプチャしてください。
        </p>
      </footer>
    </main>
  );
}

export default App;
