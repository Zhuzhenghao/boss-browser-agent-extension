import { format } from 'node:util';
import createDebug from 'debug';

let debugSink = null;

export function setMidsceneDebugSink(sink) {
  debugSink = typeof sink === 'function' ? sink : null;
}

export function createMidsceneDebug(namespace) {
  const debugLogger = createDebug(namespace);

  return (...args) => {
    if (!debugLogger.enabled && !debugSink) {
      return;
    }

    let message = '';
    if (args.length === 0) {
      message = namespace;
      if (debugLogger.enabled) {
        debugLogger('');
      }
      debugSink?.({ namespace, message });
      return;
    }

    if (typeof args[0] === 'string') {
      message = format(...args);
      if (debugLogger.enabled) {
        debugLogger(...args);
      }
      debugSink?.({ namespace, message });
      return;
    }

    message = format('%o', args);
    if (debugLogger.enabled) {
      debugLogger('%o', args);
    }
    debugSink?.({ namespace, message, args });
  };
}
