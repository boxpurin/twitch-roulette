import { Input } from "@/shared/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Button } from "@/shared/components/ui/button";
import { useEffect, useId, useRef, useState } from "react";
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
  const fieldId = useId();
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
      className="manual-item-form mb-5"
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
      <FieldGroup className="@container-normal my-5 flex-row items-end gap-3 max-[480px]:flex-col max-[480px]:items-stretch">
        <Field className="min-w-0 flex-1 gap-2">
          <FieldLabel htmlFor={`manual-${fieldId}-1`}>項目名</FieldLabel>
          <Input
            id={`manual-${fieldId}-1`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="追加する項目の名前"
            required
          />
        </Field>
        <Button
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
        </Button>
      </FieldGroup>
      {lookupUser ? (
        <>
          <FieldGroup className="@container-normal my-5 flex-row items-end gap-3 max-[480px]:flex-col max-[480px]:items-stretch">
            <Field className="min-w-0 flex-1 gap-2">
              <FieldLabel htmlFor={`manual-${fieldId}-2`}>
                Twitch ログイン名（任意）
              </FieldLabel>
              <Input
                id={`manual-${fieldId}-2`}
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
            </Field>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void confirmUser();
              }}
              disabled={disabled || checking || !login.trim()}
            >
              {checking ? "確認中…" : "ユーザーを確認"}
            </Button>
          </FieldGroup>
          <p id="twitch-login-help" className="text-sm">
            プロフィール URL の twitch.tv/
            に続くログイン名を入力し、ユーザーを確認してください。空欄なら
            Twitch と紐づけずに追加します。
          </p>
          {user ? (
            <div
              className="mt-3 flex items-center gap-3 [overflow-wrap:anywhere]"
              role="status"
            >
              {user.profileImageUrl.startsWith("https://") ? (
                <img
                  src={user.profileImageUrl}
                  className="rounded-full"
                  alt=""
                  width="40"
                  height="40"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div>
                <strong>{user.displayName}</strong>（{user.login}）
                <p className="text-sm">Twitch ID: {user.id}</p>
                {existing ? (
                  <p className="text-sm">
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
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {weightLimit ? (
        <p role="alert" className="text-destructive">
          倍率が上限に達しています。既存項目の倍率を変更してから追加してください。
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
