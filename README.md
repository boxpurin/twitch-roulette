# Twitch Roulette

Client ID を設定して Twitch OAuth ログインし、手動で追加した項目から抽選できる React / TypeScript / Vite のブラウザアプリです。チャンネルポイント報酬交換の購読・参加者の自動登録は未実装です。

## ローカルでログインする

1. [Twitch Developer Console](https://dev.twitch.tv/console/apps) でアプリを登録します。登録にはメール認証と二要素認証が必要です。
2. **OAuth Redirect URLs** に `http://localhost:5173/` を追加します。末尾の `/` を含め、後述の設定と一致させてください。
3. クライアント種別の選択がある場合は **Confidential** を選びます。Twitch の Public クライアントは Device Code Flow 専用のため、このアプリの Implicit Flow では使用しません。Client Secret は作成・設定・配布する必要がありません。
4. 管理画面の **Client ID** を控えます。Client ID は公開識別子です。Client Secret やアクセストークンとは異なります。
5. 設定ファイルを用意します。

   ```bash
   cp .env.example .env.local
   ```

   `.env.local` を編集します。

   ```dotenv
   VITE_TWITCH_CLIENT_ID=ここにClient_IDを設定
   VITE_TWITCH_REDIRECT_URI=http://localhost:5173/
   ```

   `VITE_` 設定はブラウザの配信コードに組み込まれます。ここに秘密情報は入れないでください。既存 `.env` の `TWITCH_API_TOKEN` はこのアプリでは使用しません。

6. 起動します。環境変数を変更した場合はサーバーを再起動してください。

   ```bash
   pnpm install
   pnpm dev
   ```

7. `http://localhost:5173/` を開き、**Twitch でログイン** を押します。Twitch 上で配信者アカウントとして許可すると、元の画面にログイン名とユーザー ID が表示されます。

開発ポートは 5173 に固定しています。使用中の場合は起動が失敗します。ポートを変えるときは、Twitch の登録 URL・環境変数・起動ポートをすべて合わせてください。`localhost` と `127.0.0.1` は別のホストです。

## ルーレットを回す

ログイン後、項目名を入力して「項目を追加」を押し、円盤直下の「ルーレットを回す」で抽選します。約4秒で減速して停止し、上部の矢印が指す当選項目を円盤下に表示します。

- 項目が0件の場合と演出中は回すボタンが無効になります。
- 演出中は項目の追加・編集・削除も無効になります。停止後は再編集・再抽選できます。
- 各項目の当選確率は均等です。同名の項目も独立した項目として扱い、当選した項目を自動削除しません。
- 項目と結果は画面のメモリ内だけで保持し、再読み込み・ログアウトでリセットします。
- Canvas 2D で円盤を描画し、回転中だけ描画フレームを予約します。停止・画面破棄時にはループを終了します。

## 認証方式と制約

Twitch 公式がブラウザアプリ向けに説明している **Implicit Flow** を使用します。AGENTS.md の Authorization Code Flow + PKCE 方針からの変更は、この認証実装についてユーザー承認済みです。現行公式資料の Authorization Code Flow は Client Secret が必須で、PKCE の対応は確認できていません。

- 要求権限は、今後の報酬交換読み取りに必要な `channel:read:redemptions` のみです。
- ログインごとに暗号学的乱数の `state` を作成し、sessionStorage に10分間だけ有効な要求情報として保存します。戻り値との一致を検査し、一度使った要求は削除します。
- Twitch からフラグメントに返されたトークンは、起動時に URL と履歴から除去します。`/oauth2/validate` で Client ID・ユーザー ID・権限・有効期限を確認した後に認証済みとします。
- アクセストークンはメモリだけに保持し、localStorage・sessionStorage・設定ファイル・ログには保存しません。ブラウザに読み込んだ情報を、そのブラウザ自身から秘匿することはできません。
- 一時間ごとに再検証し、期限切れ・検証失敗・ログアウト・ページ離脱時にセッションを終了します。タブを再表示した際にも期限と再検証の必要性を確認します。通信のタイムアウトは15秒です。
- 再読み込みすると再ログインが必要です。自動更新・リフレッシュトークン保存は行いません。
- ログアウトはこの画面のセッション終了です。Twitch 上のアプリ許可も取り消す場合は、[Twitch の接続設定](https://www.twitch.tv/settings/connections) で解除してください。
- 他ブラウザ、複数端末、OBS ブラウザソースとの同期はありません。OBS では通常ブラウザのこの画面をキャプチャしてください。

## 静的ホスティング

本番の HTTPS URL を Twitch の OAuth Redirect URLs と `VITE_TWITCH_REDIRECT_URI` に設定し、`pnpm build` の出力 `dist/` を配信します。設定はビルド時に反映されます。戻り先 URL でこのアプリの HTML が返るようホスティングを設定してください。HTTP はループバックでの開発時のみ許可します。

## 検証

```bash
pnpm typecheck
pnpm lint
pnpm test --run
pnpm build
```

`pnpm test --run` は `pnpm test` を一回実行で終了する指定です。単体テストでは Twitch 通信をモックします。state・トークンの検証、期限切れ・再検証・中断・遅延応答、認証画面に加え、項目管理、固定乱数での抽選、矢印と停止角度の一致、二重開始防止、停止・破棄時のフレーム終了を検証します。

実接続の確認では、ご自身の Client ID を設定し、ログイン → 許可 → ユーザー表示 → ログアウトを確認してください。認可をキャンセルした場合にエラーから再試行できることも確認できます。モックテストの成功は、実アカウントでの認可操作の成功を保証するものではありません。

## 公式資料

- [アプリ登録と Client ID](https://dev.twitch.tv/docs/authentication/register-app/)
- [Implicit Flow と Public クライアントの制約](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [トークン検証と一時間ごとの再検証要件](https://dev.twitch.tv/docs/authentication/validate-tokens/)
- [報酬交換イベントと必要権限](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchannel_points_custom_reward_redemptionadd)
