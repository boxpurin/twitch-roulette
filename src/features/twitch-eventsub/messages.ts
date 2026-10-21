import { isRecord, isText } from "../../shared/validation";
import type { Redemption } from "../participants/history";

export const REDEMPTION_TYPE =
  "channel.channel_points_custom_reward_redemption.add";
export function readMessage(
  data: unknown,
): Record<string, unknown> | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const value: unknown = JSON.parse(data);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function readRedemption(
  message: Record<string, unknown>,
  userId: string,
  rewardId: string,
): Redemption | undefined {
  const { metadata, payload } = message;
  if (
    !isRecord(metadata) ||
    metadata.message_type !== "notification" ||
    !isText(metadata.message_id) ||
    metadata.subscription_type !== REDEMPTION_TYPE ||
    metadata.subscription_version !== "1" ||
    !isRecord(payload)
  )
    return undefined;
  const { event, subscription } = payload;
  if (
    !isRecord(subscription) ||
    subscription.type !== REDEMPTION_TYPE ||
    subscription.version !== "1" ||
    !isRecord(event) ||
    event.broadcaster_user_id !== userId ||
    !isRecord(event.reward) ||
    event.reward.id !== rewardId ||
    !isText(event.id) ||
    !isText(event.user_id) ||
    !isText(event.user_name) ||
    !isText(event.redeemed_at)
  )
    return undefined;
  const redeemedAt = Date.parse(event.redeemed_at);
  if (!Number.isFinite(redeemedAt)) return undefined;
  return {
    userId: event.user_id,
    name: event.user_name,
    redemptionId: event.id,
    messageId: metadata.message_id,
    redeemedAt,
  };
}
