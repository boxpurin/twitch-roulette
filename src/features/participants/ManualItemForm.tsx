import { useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { AuthSession, TwitchUser } from "../twitch-auth/session";
import type { ItemsAction, RouletteItem } from "./items";
import { isPositiveInteger } from "../../shared/validation";

export default function ManualItemForm({
  items,
  dispatch,
  lookupUser,
  disabled,
}: {
  items: readonly RouletteItem[];
  dispatch: Dispatch<ItemsAction>;
  lookupUser?: AuthSession["lookupUser"];
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [user, setUser] = useState<TwitchUser | null>(null);
  const [pendingRequest, setPendingRequest] = useState<AbortController | null>(
    null,
  );
  const checking =
    !!pendingRequest && !pendingRequest.signal.aborted && !disabled;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const existing = user
    ? items.find((item) => item.userId === user.id)
    : undefined;
  const needsConfirmation = !!login.trim() && !user;
  const weightLimit =
    !!existing && !isPositiveInteger((existing.weight ?? 1) + 1);

  useEffect(() => {
    if (disabled) {
      request.current?.abort();
      request.current = null;
    }
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [disabled]);

  async function confirmUser() {
    if (!lookupUser || disabled || !login.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPendingRequest(controller);
    setUser(null);
    setError(null);
    setNotice(null);
    try {
      const found = await lookupUser(login, controller.signal);
      if (request.current !== controller || controller.signal.aborted) return;
      setUser(found);
      setName((current) => (current.trim() ? current : found.displayName));
    } catch (cause) {
      if (request.current !== controller || controller.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "ユーザーを確認できません。もう一度確認してください。",
      );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPendingRequest(null);
      }
    }
  }

  return (
    <form
      className="manual-item-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          disabled ||
          checking ||
          !name.trim() ||
          needsConfirmation ||
          weightLimit
        )
          return;
        dispatch({
          type: "add",
          id: crypto.randomUUID(),
          name,
          ...(user ? { userId: user.id } : {}),
        });
        setNotice(
          existing
            ? "登録済みの参加者の倍率を 1 加算しました。"
            : "項目を追加しました。",
        );
        setName("");
        setLogin("");
        setUser(null);
        setError(null);
      }}
    >
      <div className="item-add">
        <label className="item-field">
          <span>項目名</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="追加する項目の名前"
            required
          />
        </label>
        <button
          type="submit"
          disabled={
            disabled ||
            checking ||
            !name.trim() ||
            needsConfirmation ||
            weightLimit
          }
        >
          {existing ? "倍率を +1" : "項目を追加"}
        </button>
      </div>
      {lookupUser ? (
        <>
          <div className="item-add">
            <label className="item-field">
              <span>Twitch ログイン名（任意）</span>
              <input
                value={login}
                onChange={(event) => {
                  request.current?.abort();
                  request.current = null;
                  setPendingRequest(null);
                  setLogin(event.target.value);
                  setUser(null);
                  setError(null);
                  setNotice(null);
                }}
                placeholder="例: twitchdev"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="twitch-login-help"
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                void confirmUser();
              }}
              disabled={disabled || checking || !login.trim()}
            >
              {checking ? "確認中…" : "ユーザーを確認"}
            </button>
          </div>
          <p id="twitch-login-help" className="caption">
            プロフィール URL の twitch.tv/
            に続くログイン名を入力し、ユーザーを確認してください。空欄なら
            Twitch と紐づけずに追加します。
          </p>
          {user ? (
            <div className="twitch-user-preview" role="status">
              {user.profileImageUrl.startsWith("https://") ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  width="40"
                  height="40"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div>
                <strong>{user.displayName}</strong>（{user.login}）
                <p className="caption">Twitch ID: {user.id}</p>
                {existing ? (
                  <p className="caption">
                    登録済みの「{existing.name}」の倍率を +1
                    します。名前と除外設定は維持します。
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : null}
      {weightLimit ? (
        <p role="alert" className="auth-error">
          倍率が上限に達しています。既存項目の倍率を変更してから追加してください。
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="caption">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
