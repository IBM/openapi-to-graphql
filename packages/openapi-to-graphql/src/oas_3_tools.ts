// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Utility functions around the OpenAPI Specification 3.
 */

// Type imports:
import { Oas2 } from './types/oas2'
import { Operation } from './types/operation'
import {
  Oas3,
  ServerObject,
  ParameterObject,
  SchemaObject,
  OperationObject,
  ResponsesObject,
  ResponseObject,
  PathItemObject,
  RequestBodyObject,
  ReferenceObject,
  LinksObject,
  LinkObject,
  MediaTypesObject,
  SecuritySchemeObject,
  SecurityRequirementObject
} from './types/oas3.js'
import {
  PreprocessingData,
  ProcessedSecurityScheme
} from './types/preprocessing_data'
import { InternalOptions } from './types/options'

// Imports:
import * as Swagger2OpenAPI from 'swagger2openapi'
import * as OASValidator from 'oas-validator'
import debug from 'debug'
import { handleWarning } from './utils'
import { parseType } from 'graphql'

// Type definitions & exports:
export type SchemaNames = {
  fromPath?: string
  fromSchema?: string
  fromRef?: string

  /**
   * Used when the preferred name is known, i.e. a new data def does not need to
   * be created
   */
  preferred?: string
}

export type RequestSchemaAndNames = {
  payloadContentType?: string
  payloadSchema?: SchemaObject | ReferenceObject
  payloadSchemaNames?: SchemaNames
  payloadRequired: boolean
}

export type ResponseSchemaAndNames = {
  responseContentType?: string
  responseSchema?: SchemaObject | ReferenceObject
  responseSchemaNames?: SchemaNames
  statusCode?: string
}

const httpLog = debug('http')
const preprocessingLog = debug('preprocessing')

const translationLog = debug('translation')

// OAS constants
export const OAS_OPERATIONS = [
  'get',
  'put',
  'post',
  'patch',
  'delete',
  'options',
  'head'
]
export const SUCCESS_STATUS_RX = /2[0-9]{2}|2XX/

/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
export async function getValidOAS3(spec: Oas2 | Oas3): Promise<Oas3> {
  // CASE: translate
  if (
    typeof (spec as Oas2).swagger === 'string' &&
    (spec as Oas2).swagger === '2.0'
  ) {
    preprocessingLog(
      `Received OpenAPI Specification 2.0 - going to translate...`
    )
    const result: { openapi: Oas3 } = await Swagger2OpenAPI.convertObj(spec, {})
    return result.openapi as Oas3

    // CASE: validate
  } else if (
    typeof (spec as Oas3).openapi === 'string' &&
    /^3/.test((spec as Oas3).openapi)
  ) {
    preprocessingLog(
      `Received OpenAPI Specification 3.0.x - going to validate...`
    )
    const valid = OASValidator.validateSync(spec, {})
    if (!valid) {
      throw new Error(`Validation of OpenAPI Specification failed.`)
    }

    preprocessingLog(`OpenAPI Specification is validated`)
    return spec as Oas3
  } else {
    throw new Error(`Invalid specification provided`)
  }
}

/**
 * Counts the number of operations in an OAS.
 */
export function countOperations(oas: Oas3): number {
  let numOps = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (isOperation(method)) {
        numOps++
      }
    }
  }
  return numOps
}

/**
 * Counts the number of operations that translate to queries in an OAS.
 */
export function countOperationsQuery(oas: Oas3): number {
  let numOps = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (isOperation(method) && method.toLowerCase() === 'get') {
        numOps++
      }
    }
  }
  return numOps
}

/**
 * Counts the number of operations that translate to mutations in an OAS.
 */
export function countOperationsMutation(oas: Oas3): number {
  let numOps = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (isOperation(method) && method.toLowerCase() !== 'get') {
        numOps++
      }
    }
  }
  return numOps
}

/**
 * Counts the number of operations with a payload definition in an OAS.
 */
export function countOperationsWithPayload(oas: Oas3): number {
  let numOps = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (
        isOperation(method) &&
        typeof oas.paths[path][method].requestBody === 'object'
      ) {
        numOps++
      }
    }
  }
  return numOps
}

/**
 * Resolves the given reference in the given object.
 */
export function resolveRef(ref: string, obj: object, parts?: string[]): any {
  if (typeof parts === 'undefined') {
    parts = ref.split('/')
  }

  if (parts.length === 0) {
    return obj
  }

  const firstElement = parts.splice(0, 1)[0]
  if (firstElement === '#') {
    return resolveRef(ref, obj, parts)
  }
  if (firstElement in obj) {
    return resolveRef(ref, obj[firstElement], parts)
  } else {
    throw new Error(`Could not resolve reference '${ref}'`)
  }
}

/**
 * Returns the base URL to use for the given operation.
 */
export function getBaseUrl(operation: Operation): string {
  // Check for servers:
  if (!Array.isArray(operation.servers) || operation.servers.length === 0) {
    throw new Error(
      `No servers defined for operation '${operation.operationId}'`
    )
  }

  // Check for local servers
  if (Array.isArray(operation.servers) && operation.servers.length > 0) {
    const url = buildUrl(operation.servers[0])

    if (Array.isArray(operation.servers) && operation.servers.length > 1) {
      httpLog(`Warning: Randomly selected first server '${url}'`)
    }

    return url.replace(/\/$/, '')
  }

  const oas = operation.oas

  if (Array.isArray(oas.servers) && oas.servers.length > 0) {
    const url = buildUrl(oas.servers[0])

    if (Array.isArray(oas.servers) && oas.servers.length > 1) {
      httpLog(`Warning: Randomly selected first server '${url}'`)
    }

    return url.replace(/\/$/, '')
  }

  throw new Error('Cannot find a server to call')
}

/**
 * Returns the default URL for a given OAS server object.
 */
function buildUrl(server: ServerObject): string {
  let url = server.url

  // Replace with variable defaults, if applicable
  if (
    typeof server.variables === 'object' &&
    Object.keys(server.variables).length > 0
  ) {
    for (let variableKey in server.variables) {
      // TODO: check for default? Would be invalid OAS
      url = url.replace(
        `{${variableKey}}`,
        server.variables[variableKey].default.toString()
      )
    }
  }

  return url
}

/**
 * Returns object | array where all object keys are sanitized. Keys passed in
 * exceptions are not sanitized.
 */
export function sanitizeObjKeys(
  obj: object | Array<any>,
  exceptions: string[] = []
): object | Array<any> {
  const cleanKeys = (obj: object | Array<any>): object | Array<any> => {
    if (obj === null || typeof obj === 'undefined') {
      return null
    } else if (Array.isArray(obj)) {
      return obj.map(cleanKeys)
    } else if (typeof obj === 'object') {
      const res: object = {}
      for (let key in obj) {
        if (!exceptions.includes(key)) {
          const saneKey = sanitize(key)
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            res[saneKey] = cleanKeys(obj[key])
          }
        } else {
          res[key] = cleanKeys(obj[key])
        }
      }
      return res
    } else {
      return obj
    }
  }
  return cleanKeys(obj)
}

/**
 * Desanitizes keys in given object by replacing them with the keys stored in
 * the given mapping.
 */
export function desanitizeObjKeys(
  obj: object | Array<any>,
  mapping: object = {}
): object | Array<any> {
  const replaceKeys = obj => {
    if (Array.isArray(obj)) {
      return obj.map(replaceKeys)
    } else if (typeof obj === 'object') {
      const res = {}
      for (let key in obj) {
        if (key in mapping) {
          const rawKey = mapping[key]
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            res[rawKey] = replaceKeys(obj[key])
          }
        } else {
          res[key] = replaceKeys(obj[key])
        }
      }
      return res
    } else {
      return obj
    }
  }
  return replaceKeys(obj)
}

/**
 * Replaces the path parameter in the given path with values in the given args.
 * Furthermore adds the query parameters for a request.
 */
export function instantiatePathAndGetQuery(
  path: string,
  parameters: ParameterObject[],
  args: object // NOTE: argument keys are sanitized!
): {
  path: string
  query: { [key: string]: string }
  headers: { [key: string]: string }
} {
  const query = {}
  const headers = {}

  // Case: nothing to do
  if (Array.isArray(parameters)) {
    // Iterate parameters:
    for (let param of parameters) {
      const sanitizedParamName = sanitize(param.name)
      if (sanitizedParamName && sanitizedParamName in args) {
        switch (param.in) {
          // Path parameters
          case 'path':
            path = path.replace(`{${param.name}}`, args[sanitizedParamName])
            break

          // Query parameters
          case 'query':
            query[param.name] = args[sanitizedParamName]
            break

          // Header parameters
          case 'header':
            headers[param.name] = args[sanitizedParamName]
            break

          // Cookie parameters
          case 'cookie':
            if (!('cookie' in headers)) {
              headers['cookie'] = ''
            }

            headers['cookie'] += `${param.name}=${args[sanitizedParamName]}; `
            break

          default:
            httpLog(
              `Warning: The parameter location '${param.in}' in the ` +
                `parameter '${param.name}' of operation '${path}' is not ` +
                `supported`
            )
        }
      } else {
        httpLog(
          `Warning: The parameter '${param.name}' of operation '${path}' ` +
            `could not be found`
        )
      }
    }
  }

  return { path, query, headers }
}

/**
 * Returns the "type" of the given JSON schema. Makes best guesses if the type
 * is not explicitly defined.
 */
export function getSchemaType(schema: SchemaObject): string | null {
  // CASE: enum
  if (Array.isArray(schema.enum)) {
    return 'enum'
  }

  // CASE: object
  if (schema.type === 'object') {
    // CASE: arbitrary JSON
    if (typeof schema.additionalProperties === 'object') {
      return 'json'
    }

    // If there are no properties:
    if (
      typeof schema.properties === 'undefined' ||
      Object.keys(schema.properties).length === 0
    ) {
      return null
    }

    return 'object'
  }

  if ('properties' in schema) {
    return 'object'
  }

  // CASE: array
  if ('items' in schema) {
    return 'array'
  }

  // CASE: 64 bit int - return number, leading to use of GraphQLFloat:
  if (schema.type === 'integer' && schema.format === 'int64') {
    return 'number'
  }

  // CASE: a type is present
  if (typeof schema.type === 'string') {
    return schema.type
  }

  // CASE: nullable - default to string
  if (typeof schema.nullable !== 'undefined') {
    return 'string'
  }

  return null
}

/**
 * Determines an approximate name for the resource at the given path.
 */
export function inferResourceNameFromPath(path: string): string {
  /**
   * Remove the path parameters from the path
   *
   * For example, turn /user/{userId}/car into userCar
   */
  let pathNoPathParams = path.split('/').reduce((path, part) => {
    if (!/{|}/g.test(part)) {
      return path + capitalize(part)
    } else {
      return path
    }
  })

  return pathNoPathParams
}

/**
 * Returns JSON-compatible schema required by the given endpoint - or null if it
 * does not exist.
 */
export function getRequestSchema(
  endpoint: OperationObject,
  oas: Oas3
): { payloadContentType: string; payloadSchema: SchemaObject } | null {
  if (typeof endpoint.requestBody === 'object') {
    let requestBody: RequestBodyObject | ReferenceObject = endpoint.requestBody

    // Make sure we have a RequestBodyObject:
    if (typeof (requestBody as ReferenceObject).$ref === 'string') {
      requestBody = resolveRef(
        (requestBody as ReferenceObject).$ref,
        oas
      ) as RequestBodyObject
    } else {
      requestBody = (requestBody as any) as RequestBodyObject
    }

    if (typeof requestBody.content === 'object') {
      const content: MediaTypesObject = requestBody.content

      // Prioritize content-type JSON
      if (Object.keys(content).includes('application/json')) {
        return {
          payloadContentType: 'application/json',
          payloadSchema: content['application/json'].schema as SchemaObject
        }
      } else {
        // Pick first (random) content type
        const randomContentType = Object.keys(content)[0]

        return {
          payloadContentType: randomContentType,
          payloadSchema: content[randomContentType].schema as SchemaObject
        }
      }
    }
  }
  return { payloadContentType: null, payloadSchema: null }
}

/**
 * Returns the request schema (if any) for an endpoint at given path and method,
 * a dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
export function getRequestSchemaAndNames(
  path: string,
  method: string,
  oas: Oas3
): RequestSchemaAndNames {
  const endpoint: OperationObject = oas.paths[path][method]
  let payloadRequired = false
  let payloadSchemaNames: any = {}
  let { payloadContentType, payloadSchema } = getRequestSchema(endpoint, oas)

  if (payloadSchema) {
    let requestBody = endpoint.requestBody

    // Determine if request body is required:
    if (typeof requestBody === 'object') {
      // Resolve reference if needed:
      if (typeof (requestBody as ReferenceObject).$ref === 'string') {
        requestBody = resolveRef(requestBody['$ref'], oas)
      }
      if (typeof (requestBody as RequestBodyObject).required === 'boolean') {
        payloadRequired = (requestBody as RequestBodyObject).required
      }
    }

    payloadSchemaNames.fromPath = inferResourceNameFromPath(path)

    if ('$ref' in payloadSchema) {
      payloadSchemaNames.fromRef = payloadSchema['$ref'].split('/').pop()
      payloadSchema = resolveRef(payloadSchema['$ref'], oas)
    }
    if ('title' in payloadSchema) {
      payloadSchemaNames.fromSchema = payloadSchema.title
    }

    /**
     * If request body content-type is not application/json, do not parse.
     * Rather, interpret the request body as a string
     */
    if (payloadContentType !== 'application/json') {
      const saneContentTypeName = uncapitalize(
        payloadContentType.split('/').reduce((name, term) => {
          return name + capitalize(term)
        })
      )

      payloadSchemaNames = {
        fromPath: saneContentTypeName
      }

      let description = payloadContentType + ' request placeholder object'

      if (
        'description' in payloadSchema &&
        typeof payloadSchema['description'] === 'string'
      ) {
        description += `\n\nOriginal top level description: '${
          payloadSchema['description']
        }'`
      }

      payloadSchema = {
        description: description,
        type: 'string'
      }
    }

    return {
      payloadContentType,
      payloadSchema,
      payloadSchemaNames,
      payloadRequired
    }
  }
  return {
    payloadRequired: false
  }
}

/**
 * Returns JSON-compatible schema produced by the given endpoint - or null if it
 * does not exist.
 */
export function getResponseSchema(
  endpoint: OperationObject,
  statusCode: string,
  oas: Oas3
): { responseContentType: string; responseSchema: SchemaObject } | null {
  if (typeof endpoint.responses === 'object') {
    const responses: ResponsesObject = endpoint.responses
    if (typeof responses[statusCode] === 'object') {
      let response: ResponseObject | ReferenceObject = responses[statusCode]

      // Make sure we have a ResponseObject:
      if (typeof (response as ReferenceObject).$ref === 'string') {
        response = resolveRef(
          (response as ReferenceObject).$ref,
          oas
        ) as ResponseObject
      } else {
        response = (response as any) as ResponseObject
      }

      if (response.content && typeof response.content !== 'undefined') {
        const content: MediaTypesObject = response.content

        // Prioritize content-type JSON
        if (Object.keys(content).includes('application/json')) {
          return {
            responseContentType: 'application/json',
            responseSchema: content['application/json'].schema as SchemaObject
          }
        } else {
          // Pick first (random) content type
          const randomContentType = Object.keys(content)[0]

          return {
            responseContentType: randomContentType,
            responseSchema: content[randomContentType].schema as SchemaObject
          }
        }
      }
    }
  }
  return { responseContentType: null, responseSchema: null }
}

/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 */
export function getResponseSchemaAndNames(
  path: string,
  method: string,
  oas: Oas3,
  data: PreprocessingData,
  options: InternalOptions
): ResponseSchemaAndNames {
  const endpoint: OperationObject = oas.paths[path][method]
  const responseSchemaNames: any = {}
  const statusCode = getResponseStatusCode(path, method, oas, data)
  if (!statusCode) {
    return {}
  }
  let { responseContentType, responseSchema } = getResponseSchema(
    endpoint,
    statusCode,
    oas
  )

  if (responseSchema) {
    responseSchemaNames.fromPath = inferResourceNameFromPath(path)

    if ('$ref' in responseSchema) {
      responseSchemaNames.fromRef = responseSchema['$ref'].split('/').pop()
      responseSchema = resolveRef(responseSchema['$ref'], oas)
    }
    if ('title' in responseSchema) {
      responseSchemaNames.fromSchema = responseSchema.title
    }

    /**
     * If request body content-type is not application/json, do not parse.
     * Rather, interpret the request body as a string
     */
    if (responseContentType !== 'application/json') {
      let description =
        'Placeholder object to access non-application/json ' + 'response bodies'

      if (
        'description' in responseSchema &&
        typeof responseSchema['description'] === 'string'
      ) {
        description += `\n\nOriginal top level description: '${
          responseSchema['description']
        }'`
      }

      responseSchema = {
        description: description,
        type: 'string'
      }
    }

    return {
      responseContentType,
      responseSchema,
      responseSchemaNames,
      statusCode
    }
  } else {
    /**
     * 204 is a special case in which a successful call does not return a
     * response. GraphQL does not support that kind of functionality so by
     * default, these operations will be ignored.
     *
     * However, if the following condition is true, then OpenAPI-to-GraphQL will inject
     * a placeholder response schema.
     */
    if (statusCode === '204' && options.fillEmptyResponses) {
      return {
        responseSchemaNames: {
          fromPath: inferResourceNameFromPath(path)
        },
        responseContentType: 'application/json',
        responseSchema: {
          description:
            'Placeholder object to support operations with no response schema',
          type: 'string'
        }
      }
    }

    return {}
  }
}

/**
 * Returns the success status code for the operation at the given path and
 * method (or null).
 */
export function getResponseStatusCode(
  path: string,
  method: string,
  oas: Oas3,
  data: PreprocessingData
): string | void {
  const endpoint: OperationObject = oas.paths[path][method]

  if (typeof endpoint.responses === 'object') {
    const codes = Object.keys(endpoint.responses)
    const successCodes = codes.filter(code => {
      return SUCCESS_STATUS_RX.test(code)
    })
    if (successCodes.length === 1) {
      return successCodes[0]
    } else if (successCodes.length > 1) {
      handleWarning({
        typeKey: 'MULTIPLE_RESPONSES',
        culprit: `${method.toUpperCase()} ${path}`,
        solution: `${successCodes[0]}`,
        data,
        log: translationLog
      })
      return successCodes[0]
    }
  }
  return null
}

/**
 * Returns an hash containing the links defined in the given endpoint.
 */
export function getEndpointLinks(
  path: string,
  method: string,
  oas: Oas3,
  data: PreprocessingData
): { [key: string]: LinkObject } {
  const links = {}
  const endpoint: OperationObject = oas.paths[path][method]
  const statusCode = getResponseStatusCode(path, method, oas, data)
  if (!statusCode) {
    return links
  }
  if (typeof endpoint.responses === 'object') {
    const responses: ResponsesObject = endpoint.responses
    if (typeof responses[statusCode] === 'object') {
      let response: ResponseObject | ReferenceObject = responses[statusCode]

      if (typeof (response as ReferenceObject).$ref === 'string') {
        response = resolveRef(
          (response as ReferenceObject).$ref,
          oas
        ) as ResponseObject
      }

      // Here, we can be certain we have a ResponseObject:
      response = (response as any) as ResponseObject

      if (typeof response.links === 'object') {
        const epLinks: LinksObject = response.links
        for (let linkKey in epLinks) {
          let link: LinkObject | ReferenceObject = epLinks[linkKey]

          // Make sure we have LinkObjects:
          if (typeof (link as ReferenceObject).$ref === 'string') {
            link = resolveRef(link['$ref'], oas)
          } else {
            link = (link as any) as LinkObject
          }
          links[linkKey] = link
        }
      }
    }
  }
  return links
}

/**
 * Returns the list of parameters for the endpoint at the given method and path.
 * Resolves possible references.
 */
export function getParameters(
  path: string,
  method: string,
  oas: Oas3
): ParameterObject[] {
  let parameters = []

  if (!isOperation(method)) {
    translationLog(
      `Warning: attempted to get parameters for ${method} ${path}, ` +
        `which is not an operation.`
    )
    return parameters
  }

  const pathItemObject: PathItemObject = oas.paths[path]
  const pathParams = pathItemObject.parameters

  // First, consider parameters in Path Item Object:
  if (Array.isArray(pathParams)) {
    const pathItemParameters: ParameterObject[] = pathParams.map(p => {
      if (typeof (p as ReferenceObject).$ref === 'string') {
        // Here we know we have a parameter object:
        return resolveRef(p['$ref'], oas) as ParameterObject
      } else {
        // Here we know we have a parameter object:
        return (p as any) as ParameterObject
      }
    })
    parameters = parameters.concat(pathItemParameters)
  }

  // Second, consider parameters in Operation Object:
  const opObject: OperationObject = oas.paths[path][method]
  const opObjectParameters = opObject.parameters

  if (Array.isArray(opObjectParameters)) {
    const opParameters: ParameterObject[] = opObjectParameters.map(p => {
      if (typeof (p as ReferenceObject).$ref === 'string') {
        // Here we know we have a parameter object:
        return resolveRef(p['$ref'], oas) as ParameterObject
      } else {
        // Here we know we have a parameter object:
        return (p as any) as ParameterObject
      }
    })
    parameters = parameters.concat(opParameters)
  }

  return parameters
}

/**
 * Returns an array of server objects for the opeartion at the given path and
 * method. Considers in the following order: global server definitions,
 * definitions at the path item, definitions at the operation, or the OAS
 * default.
 */
export function getServers(
  path: string,
  method: string,
  oas: Oas3
): ServerObject[] {
  let servers = []
  // Global server definitions:
  if (Array.isArray(oas.servers) && oas.servers.length > 0) {
    servers = oas.servers
  }

  // Path item server definitions override global:
  const pathItem = oas.paths[path]
  if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) {
    servers = pathItem.servers
  }

  // Operation server definitions override path item:
  const operationObj = pathItem[method]
  if (Array.isArray(operationObj.servers) && operationObj.servers.length > 0) {
    servers = operationObj.servers
  }

  // Default, in case there is no server:
  if (servers.length === 0) {
    let server: ServerObject = {
      url: '/' // TODO: avoid double-slashes
    }
    servers.push(server)
  }

  return servers
}

/**
 * Returns a map of Security Scheme definitions, identified by keys. Resolves
 * possible references.
 */
export function getSecuritySchemes(
  oas: Oas3
): { [key: string]: SecuritySchemeObject } {
  // Collect all security schemes:
  const securitySchemes: { [key: string]: SecuritySchemeObject } = {}
  if (
    typeof oas.components === 'object' &&
    typeof oas.components.securitySchemes === 'object'
  ) {
    for (let schemeKey in oas.components.securitySchemes) {
      const obj = oas.components.securitySchemes[schemeKey]

      // Ensure we have actual SecuritySchemeObject:
      if (typeof (obj as ReferenceObject).$ref === 'string') {
        // Result of resolution will be SecuritySchemeObject:
        securitySchemes[schemeKey] = resolveRef(
          (obj as ReferenceObject).$ref,
          oas
        ) as SecuritySchemeObject
      } else {
        // We already have a SecuritySchemeObject:
        securitySchemes[schemeKey] = (obj as any) as SecuritySchemeObject
      }
    }
  }
  return securitySchemes
}

/**
 * Returns the list of sanitized keys of non-OAuth2 security schemes
 * required by the operation at the given path and method.
 */
export function getSecurityRequirements(
  path: string,
  method: string,
  securitySchemes: { [key: string]: ProcessedSecurityScheme },
  oas: Oas3
): string[] {
  const results: string[] = []

  // First, consider global requirements:
  const globalSecurity: SecurityRequirementObject[] = oas.security
  if (globalSecurity && typeof globalSecurity !== 'undefined') {
    for (let secReq of globalSecurity) {
      for (let schemaKey in secReq) {
        if (
          securitySchemes[schemaKey] &&
          typeof securitySchemes[schemaKey] === 'object' &&
          securitySchemes[schemaKey].def.type !== 'oauth2'
        ) {
          results.push(schemaKey)
        }
      }
    }
  }

  // Local:
  const operation: OperationObject = oas.paths[path][method]
  const localSecurity: SecurityRequirementObject[] = operation.security
  if (localSecurity && typeof localSecurity !== 'undefined') {
    for (let secReq of localSecurity) {
      for (let schemaKey in secReq) {
        if (
          securitySchemes[schemaKey] &&
          typeof securitySchemes[schemaKey] === 'object' &&
          securitySchemes[schemaKey].def.type !== 'oauth2'
        ) {
          if (!results.includes(schemaKey)) {
            results.push(schemaKey)
          }
        }
      }
    }
  }
  return results
}

/**
 * First sanitizes given string and then also camel-cases it.
 */
export function sanitize(
  str: string,
  lowercaseFirstChar: boolean = true
): string {
  /**
   * Remove all GraphQL unsafe characters
   *
   * Also remove _, even though it is GraphQL safe, to follow prescribed
   * GraphQL naming conventions, which either use PascalCase, camelCase,
   * or ALL_CAPS (the last of which has not been implemented)
   *
   * TODO: Adapt to allow for ALL_CAPS
   */
  let sanitized = str.split(/[^a-zA-Z0-9]/g).reduce((path, part) => {
    return path + capitalize(part)
  })

  // Special case: we cannot start with number, and cannot be empty:
  if (/^[0-9]/.test(sanitized) || sanitized === '') {
    sanitized = '_' + sanitized
  }

  // First character should be lowercase
  if (lowercaseFirstChar) {
    sanitized = uncapitalize(sanitized)
  }

  return sanitized
}

/**
 * Sanitizes the given string and stores the sanitized-to-original mapping in
 * the given mapping.
 */
export function sanitizeAndStore(
  str: string,
  mapping: { [key: string]: string }
): string {
  if (!(typeof mapping === 'object')) {
    throw new Error(`No/invalid mapping passed to sanitizeAndStore`)
  }
  const clean = sanitize(str)
  if (!clean) {
    throw new Error(`Cannot sanitizeAndStore '${str}'`)
  } else if (clean !== str) {
    if (clean in mapping && str !== mapping[clean]) {
      translationLog(
        `Warning: '${str}' and '${mapping[clean]}' both sanitize ` +
          `to '${clean}' - collision possible. Desanitize to '${str}'.`
      )
    }
    mapping[clean] = str
  }
  return clean
}

/**
 * Return an object similar to the input object except the keys are all
 * sanitized
 */
export function sanitizeObjectKeys(obj: object): object {
  return Object.keys(obj).reduce((acc, key) => {
    acc[sanitize(key)] = obj[key]
    return acc
  }, {})
}

/**
 * Stringifies and possibly trims the given string to the provided length.
 */
export function trim(str: string, length: number): string {
  if (typeof str !== 'string') {
    str = JSON.stringify(str)
  }

  if (str && str.length > length) {
    str = `${str.substring(0, length)}...`
  }

  return str
}

/**
 * Determines if the given "method" is indeed an operation. Alternatively, the
 * method could point to other types of information (e.g., parameters, servers).
 */
export function isOperation(method: string): boolean {
  return OAS_OPERATIONS.includes(method.toLowerCase())
}

/**
 * Creates a string that describes an operation in the form:
 * {name of OAS} {HTTP method in ALL_CAPS} {operation path}
 */
export function getOperationString(operation: Operation, oass: Oas3[]): string {
  if (oass.length === 1) {
    return formatOperationString(operation.method, operation.path)
  } else {
    return formatOperationString(
      operation.method,
      operation.path,
      operation.oas.info.title
    )
  }
}

/**
 * Formats a string that describes an operation in the form:
 * {name of OAS} {HTTP method in ALL_CAPS} {operation path}
 *
 * Also used in preprocessing.ts where Operation objects are being constructed
 */
export function formatOperationString(
  method: string,
  path: string,
  title?: string
): string {
  if (title) {
    return `${title} ${method.toUpperCase()} ${path}`
  } else {
    return `${method.toUpperCase()} ${path}`
  }
}

/**
 * Capitalizes a given string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Uncapitalizes a given string
 */
export function uncapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1)
}

/**
 * For operations that do not have an operationId, generate one
 */
export function generateOperationId(method: string, path: string): string {
  return sanitize(`${method}:${path}`)
}
