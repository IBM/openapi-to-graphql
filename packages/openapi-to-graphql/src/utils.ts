// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import { PreprocessingData } from './types/preprocessing_data'
import { Warning } from './types/options'

export const mitigations = {
  /**
   * Problems with the OAS
   *
   * Should be caught by the module oas-validator
   */
  INVALID_OAS: `Ignore issue and continue.`,
  UNNAMED_PARAMETER: `Ignore parameter.`,

  // General problems
  MULTIPLE_RESPONSES: `Select first response object with successful status code (200-299).`,
  MISSING_RESPONSE_SCHEMA: `Ignore operation.`,
  DUPLICATE_FIELD_NAME: `Ignore field and maintain preexisting field.`,
  DUPLICATE_LINK_KEY: `Ignore link and maintain preexisting link.`,
  UNRESOLVABLE_REFERENCE: `The schema will not be resolved.`,
  UNSUPPORTED_HTTP_SECURITY_SCHEME: `Ignore security scheme.`,
  NON_APPLICATION_JSON_SCHEMA: `Ignore schema`,
  OBJECT_MISSING_PROPERTIES: `The (sub-)object will be stringified. The property will return a string in the interface.`,

  // Links
  UNRESOLVABLE_LINK: `Ignore link.`,
  AMBIGUOUS_LINK: `Use first occurance of '#/'.`,
  LINK_NAME_COLLISION: `Ignore link and maintain preexisting field.`,

  // Multiple OAS
  MULTIPLE_OAS_SAME_TITLE: `Ignore issue and continue.`,
  DUPLICATE_OPERATIONID: `Ignore operation and maintain preexisting operation.`,
  DUPLICATE_SECURITY_SCHEME: `Ignore security scheme and maintain preexisting scheme.`,

  // Options
  CUSTOM_RESOLVER_UNKNOWN_OAS: `Ignore this set of custom resolvers.`,
  CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD: `Ignore this set of custom resolvers.`,
  LIMIT_ARGUMENT_NAME_COLLISION: `Do not override existing 'limit' argument.`,

  // Miscellaneous
  OAUTH_SECURITY_SCHEME: `Ignore security scheme`
}

/**
 * Utilities that are specific to OpenAPI-to-GraphQL
 */
export function handleWarning({
  typeKey,
  message,
  mitigationAddendum,
  path,
  data,
  log
}: {
  typeKey: string
  message: string
  mitigationAddendum?: string
  path?: string[]
  data: PreprocessingData
  log?: Function
}) {
  const mitigation = mitigations[typeKey]

  const warning: Warning = {
    type: typeKey,
    message,
    mitigation: mitigationAddendum
      ? `${mitigation} ${mitigationAddendum}`
      : mitigation
  }

  if (typeof path !== undefined) {
    warning['path'] = path
  }

  if (data.options.strict) {
    throw new Error(`${warning.type} - ${warning.message}`)
  } else {
    const output = `Warning: ${warning.message} - ${warning.mitigation}`
    if (typeof log === 'function') {
      log(output)
    } else {
      console.log(output)
    }
    data.options.report.warnings.push(warning)
  }
}

// Code provided by codename- from StackOverflow
// Link: https://stackoverflow.com/a/29622653
export function sortObject(o) {
  return Object.keys(o)
    .sort()
    .reduce((r, k) => ((r[k] = o[k]), r), {})
}

/**
 * Finds the common property names between two objects
 */
export function getCommonPropertyNames(object1, object2): string[] {
  return Object.keys(object1).filter(propertyName => {
    return propertyName in object2
  })
}
