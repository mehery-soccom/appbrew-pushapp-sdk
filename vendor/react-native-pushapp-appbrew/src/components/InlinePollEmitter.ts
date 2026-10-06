import { EventEmitter } from 'events';

declare global {
  var __INLINE_POLL_EMITTER__: EventEmitter | undefined;
}

const inlinePollEmitter = global.__INLINE_POLL_EMITTER__ || new EventEmitter();
global.__INLINE_POLL_EMITTER__ = inlinePollEmitter;

export default inlinePollEmitter;
