// TooltipEmitter.ts
import { EventEmitter } from 'events';

declare global {
  // Extend the global object to safely include our custom emitter
  var __TOOLTIP_EMITTER__: EventEmitter | undefined;
}

const tooltipEmitter = global.__TOOLTIP_EMITTER__ || new EventEmitter();
global.__TOOLTIP_EMITTER__ = tooltipEmitter;

export default tooltipEmitter;
