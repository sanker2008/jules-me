import type { ProState } from '../types/pro';
import { resolveStoredProState } from './license-state';

export function canAttachProImage(state: ProState, now = Date.now()): boolean {
  return resolveStoredProState(state, state.deviceId, now).state.isPro;
}
