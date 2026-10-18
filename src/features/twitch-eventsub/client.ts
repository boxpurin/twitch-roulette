import { isRecord, isText } from "../../shared/validation";
import { readMessage, readRedemption } from "./messages";
import type { Redemption } from "../roulette/history";

export interface EventSocket {
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}
export interface ReceptionStatus {
  phase: "stopped" | "connecting" | "connected" | "reconnecting" | "error";
  message: string;
}
export interface ReceptionOptions {
  userId: string;
  rewardId: string;
  subscribe(
    sessionId: string,
    rewardId: string,
    signal: AbortSignal,
  ): Promise<void>;
  openSocket?: (url: string) => EventSocket;
  onEvent(event: Redemption): void;
  onStatus(status: ReceptionStatus): void;
}
interface Link {
  socket: EventSocket;
  welcomed: boolean;
  heartbeat: number;
  timer?: ReturnType<typeof setTimeout>;
  requestTimer?: ReturnType<typeof setTimeout>;
  request?: AbortController;
}
const INITIAL_URL = "wss://eventsub.wss.twitch.tv/ws";

function browserSocket(url: string): EventSocket {
  const native = new WebSocket(url);
  const socket: EventSocket = {
    onmessage: null,
    onclose: null,
    onerror: null,
    close() {
      native.onmessage = native.onclose = native.onerror = null;
      native.close();
    },
  };
  native.onmessage = (event) => socket.onmessage?.({ data: event.data });
  native.onclose = () => socket.onclose?.();
  native.onerror = () => socket.onerror?.();
  return socket;
}

export function connectRedemptions(options: ReceptionOptions) {
  const links = new Set<Link>();
  let active: Link | undefined;
  let candidate: Link | undefined;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const live = (link: Link) => !stopped && links.has(link);
  const report = (phase: ReceptionStatus["phase"], message: string) =>
    options.onStatus({ phase, message });

  function drop(link: Link) {
    links.delete(link);
    clearTimeout(link.timer);
    clearTimeout(link.requestTimer);
    link.request?.abort();
    link.socket.onmessage = link.socket.onclose = link.socket.onerror = null;
    link.socket.close();
  }
  function clean() {
    clearTimeout(retry);
    retry = undefined;
    for (const link of links) drop(link);
    active = candidate = undefined;
  }
  function fatal(message: string) {
    if (stopped) return;
    stopped = true;
    clean();
    report("error", message);
  }
  function reconnect() {
    if (stopped) return;
    clean();
    report(
      "reconnecting",
      "接続が切れました。再接続しています。切断中の交換は取りこぼす可能性があります。",
    );
    retry = setTimeout(
      () => {
        retry = undefined;
        open(INITIAL_URL, false);
      },
      Math.min(1000 * 2 ** attempts++, 30000),
    );
  }
  function watchdog(link: Link) {
    clearTimeout(link.timer);
    if (link === active && candidate) return;
    link.timer = setTimeout(() => {
      if (live(link)) reconnect();
    }, link.heartbeat);
  }
  function open(url: string, handoff: boolean) {
    if (stopped) return;
    let socket: EventSocket;
    try {
      socket = (options.openSocket ?? browserSocket)(url);
    } catch {
      reconnect();
      return;
    }
    const link: Link = {
      socket,
      welcomed: false,
      heartbeat: handoff ? 30000 : 10000,
    };
    links.add(link);
    if (handoff) candidate = link;
    else active = link;
    watchdog(link);
    socket.onclose = socket.onerror = () => {
      if (!live(link)) return;
      if (link === active && candidate) {
        drop(link);
        active = undefined;
      } else reconnect();
    };
    socket.onmessage = ({ data }) => {
      if (!live(link)) return;
      const message = readMessage(data);
      if (!message || !isRecord(message.metadata) || !isRecord(message.payload))
        return;
      const type = message.metadata.message_type;
      const payload = message.payload;
      if (type === "session_welcome") {
        if (
          link.welcomed ||
          !isRecord(payload.session) ||
          !isText(payload.session.id)
        )
          return;
        const heartbeat = payload.session.keepalive_timeout_seconds;
        if (
          typeof heartbeat !== "number" ||
          !Number.isFinite(heartbeat) ||
          heartbeat <= 0 ||
          heartbeat > 600
        ) {
          fatal("Twitch の接続応答が不正です。受付を開始し直してください。");
          return;
        }
        link.welcomed = true;
        link.heartbeat = heartbeat * 1000;
        watchdog(link);
        if (handoff) {
          const old = active;
          active = link;
          candidate = undefined;
          if (old && old !== link) drop(old);
          attempts = 0;
          report("connected", "報酬交換を受信しています。");
        } else {
          link.request = new AbortController();
          link.requestTimer = setTimeout(() => {
            if (live(link))
              fatal("購読がタイムアウトしました。受付を開始し直してください。");
          }, 8000);
          void options
            .subscribe(
              payload.session.id,
              options.rewardId,
              link.request.signal,
            )
            .then(() => {
              if (!live(link)) return;
              clearTimeout(link.requestTimer);
              attempts = 0;
              report("connected", "報酬交換を受信しています。");
            })
            .catch((error) => {
              if (live(link))
                fatal(
                  error instanceof Error
                    ? error.message
                    : "報酬交換を購読できません。",
                );
            });
        }
      } else if (
        link.welcomed &&
        (type === "notification" || type === "session_keepalive")
      ) {
        watchdog(link);
        const event = readRedemption(message, options.userId, options.rewardId);
        if (event) options.onEvent(event);
      } else if (
        link.welcomed &&
        type === "session_reconnect" &&
        link === active &&
        !candidate
      ) {
        if (
          !isRecord(payload.session) ||
          !isText(payload.session.reconnect_url)
        )
          return;
        let url: URL;
        try {
          url = new URL(payload.session.reconnect_url);
        } catch {
          fatal("再接続先が不正です。");
          return;
        }
        if (
          url.protocol !== "wss:" ||
          url.hostname !== "eventsub.wss.twitch.tv" ||
          url.port ||
          url.username ||
          url.password
        ) {
          fatal("再接続先が不正です。");
          return;
        }
        clearTimeout(link.timer);
        report("reconnecting", "Twitch の接続を引き継いでいます。");
        open(payload.session.reconnect_url, true);
      } else if (link.welcomed && type === "revocation") {
        fatal(
          "報酬交換の購読が取り消されました。権限を確認し、必要なら再ログインしてください。",
        );
      }
    };
  }
  report("connecting", "Twitch に接続しています…");
  open(INITIAL_URL, false);
  return {
    stop() {
      stopped = true;
      clean();
    },
  };
}
