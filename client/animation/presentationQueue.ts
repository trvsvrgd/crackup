import {
  MAX_EFFECT_EVENTS,
  type EffectEvent,
  type EffectPacket,
} from "../../shared/protocol/presentationProtocol.js";

/** WebSocket is reliable, but reconciling/repeated batches must never replay a cue. */
export class PresentationQueue {
  private readonly seen = new Set<number>();
  private pending: { event: EffectEvent; due: number; expires: number }[] = [];
  public accepted = 0;
  public duplicates = 0;
  public expired = 0;
  public receive(packet: EffectPacket, now: number): EffectEvent[] {
    const accepted: EffectEvent[] = [];
    for (const event of packet.events) {
      if (this.seen.has(event.id)) {
        this.duplicates++;
        continue;
      }
      this.seen.add(event.id);
      while (this.seen.size > 4096)
        this.seen.delete(this.seen.values().next().value!);
      const age = Math.max(0, ((packet.tick - event.tick) | 0) / 60),
        remaining = event.delay - age;
      if (age > event.delay + 1) {
        this.expired++;
        continue;
      }
      if (this.pending.length >= MAX_EFFECT_EVENTS) this.pending.shift();
      this.pending.push({
        event,
        due: now + Math.max(0, remaining),
        expires: now + Math.max(0, remaining) + 0.35,
      });
      this.accepted++;
      accepted.push(event);
    }
    return accepted;
  }
  public update(
    now: number,
    emit: (e: EffectEvent) => void,
    pairedElapsed?: (e: EffectEvent) => number | undefined,
  ): void {
    this.pending = this.pending.filter((item) => {
      if (now > item.expires) {
        this.expired++;
        return false;
      }
      const paired = pairedElapsed?.(item.event);
      if (
        paired !== undefined
          ? paired + 0.017 < item.event.delay
          : now < item.due
      )
        return true;
      emit(item.event);
      return false;
    });
  }
  public reset(): void {
    this.pending = [];
    this.seen.clear();
  }
  public get size(): number {
    return this.pending.length;
  }
}
