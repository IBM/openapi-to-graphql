// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import { PreprocessingData } from './types/preprocessing_data'
import { Warning } from './types/options'

export enum MitigationTypes {
  /**
   * Problems with the OAS
   *
   * Should be caught by the module oas-validator
   */
  INVALID_OAS = 'INVALID_OAS',
  UNNAMED_PARAMETER = 'UNNAMED_PARAMETER',

  // General problems
  AMBIGUOUS_UNION_MEMBERS = 'AMBIGUOUS_UNION_MEMBERS',
  CANNOT_GET_FIELD_TYPE = 'CANNOT_GET_FIELD_TYPE',
  COMBINE_SCHEMAS = 'COMBINE_SCHEMAS',
  DUPLICATE_FIELD_NAME = 'DUPLICATE_FIELD_NAME',
  DUPLICATE_LINK_KEY = 'DUPLICATE_LINK_KEY',
  INVALID_HTTP_METHOD = 'INVALID_HTTP_METHOD',
  INPUT_UNION = 'INPUT_UNION',
  MISSING_RESPONSE_SCHEMA = 'MISSING_RESPONSE_SCHEMA',
  MISSING_SCHEMA = 'MISSING_SCHEMA',
  MULTIPLE_RESPONSES = 'MULTIPLE_RESPONSES',
  NON_APPLICATION_JSON_SCHEMA = 'NON_APPLICATION_JSON_SCHEMA',
  OBJECT_MISSING_PROPERTIES = 'OBJECT_MISSING_PROPERTIES',
  UNKNOWN_TARGET_TYPE = 'UNKNOWN_TARGET_TYPE',
  UNRESOLVABLE_SCHEMA = 'UNRESOLVABLE_SCHEMA',
  UNSUPPORTED_HTTP_SECURITY_SCHEME = 'UNSUPPORTED_HTTP_SECURITY_SCHEME',
  UNSUPPORTED_JSON_SCHEMA_KEYWORD = 'UNSUPPORTED_JSON_SCHEMA_KEYWORD',
  CALLBACKS_MULTIPLE_OPERATION_OBJECTS = 'CALLBACKS_MULTIPLE_OPERATION_OBJECTS',

  // Links
  AMBIGUOUS_LINK = 'AMBIGUOUS_LINK',
  LINK_NAME_COLLISION = 'LINK_NAME_COLLISION',
  UNRESOLVABLE_LINK = 'UNRESOLVABLE_LINK',

  // Multiple OAS
  DUPLICATE_OPERATIONID = 'DUPLICATE_OPERATIONID',
  DUPLICATE_SECURITY_SCHEME = 'DUPLICATE_SECURITY_SCHEME',
  MULTIPLE_OAS_SAME_TITLE = 'MULTIPLE_OAS_SAME_TITLE',

  // Options
  CUSTOM_RESOLVER_UNKNOWN_OAS = 'CUSTOM_RESOLVER_UNKNOWN_OAS',
  CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD = 'CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD',
  LIMIT_ARGUMENT_NAME_COLLISION = 'LIMIT_ARGUMENT_NAME_COLLISION',

  // Miscellaneous
  OAUTH_SECURITY_SCHEME = 'OAUTH_SECURITY_SCHEME'
}

export const mitigations: { [mitigationType in MitigationTypes]: string } = {
  /**
   * Problems with the OAS
   *
   * Should be caught by the module oas-validator
   */
  INVALID_OAS: 'Ignore issue and continue.',
  UNNAMED_PARAMETER: 'Ignore parameter.',

  // General problems
  AMBIGUOUS_UNION_MEMBERS: 'Ignore issue and continue.',
  CANNOT_GET_FIELD_TYPE: 'Ignore field and continue.',
  COMBINE_SCHEMAS: 'Ignore combine schema keyword and continue.',
  DUPLICATE_FIELD_NAME: 'Ignore field and maintain preexisting field.',
  DUPLICATE_LINK_KEY: 'Ignore link and maintain preexisting link.',
  INPUT_UNION: 'The data will be stored in an arbitrary JSON type.',
  INVALID_HTTP_METHOD: 'Ignore operation and continue.',
  MISSING_RESPONSE_SCHEMA: 'Ignore operation.',
  MISSING_SCHEMA: 'Use arbitrary JSON type.',
  MULTIPLE_RESPONSES:
    'Select first response object with successful status code (200-299).',
  NON_APPLICATION_JSON_SCHEMA: 'Ignore schema',
  OBJECT_MISSING_PROPERTIES:
    'The (sub-)object will be stored in an arbitray JSON type.',
  UNKNOWN_TARGET_TYPE: 'The data will be stored in an arbitrary JSON type.',
  UNRESOLVABLE_SCHEMA: 'Ignore and continue. May lead to unexpected behavior.',
  UNSUPPORTED_HTTP_SECURITY_SCHEME: 'Ignore security scheme.',
  UNSUPPORTED_JSON_SCHEMA_KEYWORD: 'Ignore keyword and continue.',
  CALLBACKS_MULTIPLE_OPERATION_OBJECTS: 'Select arbitrary operation object',

  // Links
  AMBIGUOUS_LINK: `Use first occurance of '#/'.`,
  LINK_NAME_COLLISION: 'Ignore link and maintain preexisting field.',
  UNRESOLVABLE_LINK: 'Ignore link.',

  // Multiple OAS
  DUPLICATE_OPERATIONID: 'Ignore operation and maintain preexisting operation.',
  DUPLICATE_SECURITY_SCHEME:
    'Ignore security scheme and maintain preexisting scheme.',
  MULTIPLE_OAS_SAME_TITLE: 'Ignore issue and continue.',

  // Options
  CUSTOM_RESOLVER_UNKNOWN_OAS: 'Ignore this set of custom resolvers.',
  CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD: 'Ignore this set of custom resolvers.',
  LIMIT_ARGUMENT_NAME_COLLISION: `Do not override existing 'limit' argument.`,

  // Miscellaneous
  OAUTH_SECURITY_SCHEME: `Ignore security scheme`
}

const MAX_INT = 2147483647
const MIN_INT = -2147483648

const MAX_LONG = 9007199254740991
const MIN_LONG = -9007199254740992

/**
 * Verify that a variable contains a safe int (2^31)
 */
export function isSafeInteger(n: unknown): boolean {
  return (
    typeof n === 'number' &&
    isFinite(n) &&
    n <= MAX_INT &&
    n >= MIN_INT &&
    n % 1 === 0
  )
}

/**
 * Verify that a variable contains a safe long (2^53)
 */
export function isSafeLong(n: unknown): boolean {
  return (
    typeof n === 'number' &&
    isFinite(n) &&
    n <= MAX_LONG &&
    n >= MIN_LONG &&
    n % 1 === 0
  )
}

/**
 * Check if a number is a safe floating point
 */
export function isSafeFloat(n: unknown): boolean {
  return typeof n === 'number' && n % 0.5 !== 0
}

/**
 * Convert a date and/or date-time string into a date object
 */
function toDate(n: string) {
  const parsed = Date.parse(n)
  const $ref = new Date()

  $ref.setTime(parsed)

  return (
    (typeof parsed === 'number' &&
      parsed !== NaN &&
      parsed > 0 &&
      String(parsed).length === 13 &&
      $ref) ||
    null
  )
}

/**
 * Serialize a date string into the ISO format
 */
export function serializeDate(n: string) {
  const date = toDate(n)
  return date && date.toJSON()
}

/**
 * Verify that a vriable contains a safe date/date-time string
 */
export function isSafeDate(n: string): boolean {
  const date = toDate(n)
  return date !== null && date.getTime() !== NaN
}

/**
 * Verify is a string is a valid URL
 */
export function isURL(s: string): boolean {
  let res = null
  /* See: https://mathiasbynens.be/demo/url-regex for URL Reg Exp source */
  const urlRegex = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z0-9]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g
  try {
    res = s.match(urlRegex)
  } catch (e) {
    res = null
  }
  return res !== null
}

/**
 * Verify if a string is a valid EMAIL
 */
export function isEmail(s: string): boolean {
  /* See: See: https://github.com/Urigo/graphql-scalars/blob/master/src/resolvers/EmailAddress.ts#L4 for EMAIL Reg Exp source */
  const emailRegex = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/
  return emailRegex.test(s)
}

/**
 * Verify if a string is a valid GUID/UUID
 */
export function isUUIDOrGUID(s: string): boolean {
  /* See: See: https://github.com/Urigo/graphql-scalars/blob/master/src/resolvers/GUID.ts#L4 for UUID Reg Exp source */
  const uuidRegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const guidRegExp = /^(\{){0,1}[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}(\}){0,1}$/gi

  if (s.startsWith('{')) {
    s = s.substring(1, s.length - 1)
  }

  return uuidRegExp.test(s) || guidRegExp.test(s)
}

/**
 * Convert the fist letter of a word in a string to upper case
 */
export function ucFirst(s: string): string {
  if (typeof s !== 'string') {
    return ''
  }

  return s.replace(/^./, c => c.toUpperCase())
}

/**
 * Check if a literal is falsy or not
 */
const isLiteralFalsey = (variable: unknown): boolean => {
  return variable === '' || variable === false || variable === 0
}

/**
 * Check if a variable contains a reference type (not a literal)
 */
const isPrimitive = (arg: any): boolean => {
  return (
    typeof arg === 'object' || (Boolean(arg) && typeof arg.apply === 'function')
  )
}

/**
 * Check that the data type of primitive and/or reference
 * variable mathes the type provided
 */
const checkTypeName = (target: unknown, type: string): boolean => {
  let typeName = ''

  // we need to separate checks for literal types and
  // primitive types so we can speed up performance and
  // keep things simple
  if (isLiteralFalsey(target) || !isPrimitive(target)) {
    // literal
    typeName = typeof target
  } else {
    // primitive/reference
    typeName = Object.prototype.toString
      .call(target)
      .replace(/^\[object (.+)\]$/, '$1')
  }

  // check if the type matches
  return Boolean(typeName.toLowerCase().indexOf(type) + 1)
}

/**
 * Get the correct type of a variable
 */
export function isTypeOf(value: unknown, type: string): boolean {
  // swagger/OpenAPI 'integer' type is converted
  // a JavaScript 'number' type for compatibility
  if (type === 'integer') {
    type = 'number'
  }

  type = type || ''
  // checks that the data type of the variable
  // matches that that was passed in
  return checkTypeName(value, type)
}

/**
 * Utilities that are specific to OpenAPI-to-GraphQL
 */
export function handleWarning<TSource, TContext, TArgs>({
  mitigationType,
  message,
  mitigationAddendum,
  path,
  data,
  log
}: {
  mitigationType: MitigationTypes
  message: string
  mitigationAddendum?: string
  path?: string[]
  data: PreprocessingData<TSource, TContext, TArgs>
  log?: Function
}) {
  const mitigation = mitigations[mitigationType]

  const warning: Warning = {
    type: mitigationType,
    message,
    mitigation: mitigationAddendum
      ? `${mitigation} ${mitigationAddendum}`
      : mitigation
  }

  if (path) {
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
// See: https://stackoverflow.com/a/29622653
export function sortObject<T>(o: T): T {
  return Object.keys(o)
    .sort()
    .reduce((r, k) => ((r[k] = o[k]), r), {}) as T
}

/**
 * Finds the common property names between two objects
 */
export function getCommonPropertyNames(object1, object2): string[] {
  return Object.keys(object1).filter(propertyName => {
    return propertyName in object2
  })
}
