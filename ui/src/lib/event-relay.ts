/**
 * Event Relay — Dashboard 侧事件发射
 *
 * 委托 core/common/event-relay.cjs 实现。
 */
import core from '@/lib/core-bridge'

export function relayEvent(eventType: string, payload: Record<string, unknown>): void {
  return core.common.eventRelay.relayEvent(eventType, payload)
}
