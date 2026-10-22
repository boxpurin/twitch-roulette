import { Button } from "@/shared/components/ui/button";
import { useSyncExternalStore } from "react";
import type { AuthConfig } from "../features/twitch-auth/oauth";
import type { AuthSession } from "../features/twitch-auth/session";
import Roulette from "./Roulette";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/shared/components/ui/card";

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
    <main className="m-auto box-border w-full max-w-[720px] px-6 py-12 text-left [overflow-wrap:anywhere] max-[480px]:px-4 max-[480px]:py-8">
      <header>
        <p className="font-bold tracking-[2px] text-primary">TWITCH ROULETTE</p>
        <h1 className="my-5 text-[clamp(30px,6vw,48px)] leading-[1.2]">
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

      <Card asChild className="mt-7">
        <section aria-labelledby="auth-heading">
          <CardHeader>
            <CardTitle id="auth-heading">配信者アカウント</CardTitle>
          </CardHeader>
          <CardContent>
            <div aria-live="polite" aria-atomic="true">
              {auth.status === "authenticated" ? (
                <>
                  <p className="font-bold text-primary">認証済み</p>
                  <p className="my-3 text-[28px] text-foreground">
                    {auth.user.login}
                  </p>
                  <p>Twitch ユーザー ID: {auth.user.userId}</p>
                </>
              ) : auth.status === "loading" ? (
                <p role="status">認証を確認しています…</p>
              ) : auth.status === "error" ? (
                <p className="text-destructive" role="alert">
                  {auth.message}
                </p>
              ) : (
                <p>まだログインしていません。</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            {auth.status === "authenticated" ? (
              <Button
                size="lg"
                className="mt-6 mb-3"
                type="button"
                onClick={session.logout}
              >
                ログアウト
              </Button>
            ) : (
              <Button
                size="lg"
                className="mt-6 mb-3"
                type="button"
                onClick={session.login}
                disabled={!config || auth.status === "loading"}
              >
                Twitch でログイン
              </Button>
            )}
            <p className="text-sm">
              チャンネルポイント報酬の読み取り権限を使用します。
            </p>
          </CardFooter>
        </section>
      </Card>

      {!config ? (
        <Card asChild className="mt-7">
          <section aria-labelledby="setup-heading">
            <CardHeader>
              <CardTitle id="setup-heading">初期設定</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                <code>.env.example</code> を <code>.env.local</code>{" "}
                にコピーし、次の値を設定して開発サーバーを再起動してください。
              </p>
              <ul className="my-4 list-disc pl-5 [&_li]:my-[10px]">
                <li>
                  <code>VITE_TWITCH_CLIENT_ID</code>: Twitch アプリの Client ID
                </li>
                <li>
                  <code>VITE_TWITCH_REDIRECT_URI</code>: Twitch に登録した戻り先
                  URL
                </li>
              </ul>
              <p>詳しい手順はプロジェクトの README を参照してください。</p>
            </CardContent>
          </section>
        </Card>
      ) : (
        <p className="mt-6 text-sm">
          登録する戻り先 URL: <code>{config.redirectUri}</code>
        </p>
      )}

      <footer className="mt-6 text-sm [&_p+p]:mt-3">
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
