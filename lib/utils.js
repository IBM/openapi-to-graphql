'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.handleWarning = handleWarning;


/**
 * Utilities that are specific to OASGraph
 */

function handleWarning(message, mitigation, data, log) {
  if (data.options.strict) {
    throw new Error(message);
  } else {
    var output = 'Warning: ' + message + ' - ' + mitigation;
    if (typeof log === 'function') {
      log(output);
    } else {
      console.log(output);
    }
    data.options.report.warnings.push(output);
  }
}