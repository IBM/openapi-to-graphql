/* @flow */

'use strict'

import type {
  PreprocessingData
} from './types/preprocessing_data.js'

/**
 * Utilities that are specific to OASGraph
 */

export function handleWarning (
  message: string,
  mitigation: string,
  data: PreprocessingData,
  log: ?Function
) {
  if (data.options.strict) {
    throw new Error(message)
  } else {
    let output = `Warning: ${message} - ${mitigation}`
    if (typeof log === 'function') {
      log(output)
    } else {
      console.log(output)
    }
    data.options.report.warnings.push(output)
  }
}
