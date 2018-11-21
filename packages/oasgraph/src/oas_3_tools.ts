// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
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
import { PreprocessingData } from './types/preprocessing_data'
import { Options } from './types/options'

// Imports:
import * as Swagger2OpenAPI from 'swagger2openapi'
import * as OASValidator from 'oas-validator'
import debug from 'debug'
import { handleWarning } from './utils'

// Type definitions & exports:
export type SchemaNames = {
  fromPath?: string,
  fromSchema?: string,
  fromRef?: string
}

export type RequestSchemaAndNames = {
  payloadContentType?: string,
  payloadSchema?: SchemaObject | ReferenceObject,
  payloadSchemaNames?: SchemaNames,
  payloadRequired: boolean
}

export type ResponseSchemaAndNames = {
  responseContentType?: string,
  responseSchema?: SchemaObject | ReferenceObject,
  responseSchemaNames?: SchemaNames
}

const logHttp = debug('http')
const logPre = debug('preprocessing')

const log = debug('translation')

// OAS constants
export const OAS_OPERATIONS = ['get', 'put', 'post', 'patch', 'delete', 'options', 'head']
export const SUCCESS_STATUS_RX = /2[0-9]{2}|2XX/

/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
export async function getValidOAS3 (spec: Oas2 | Oas3): Promise<Oas3> {
  // CASE: translate
  if (typeof (spec as Oas2).swagger === 'string'
    && (spec as Oas2).swagger === '2.0') {
    logPre(`Received OpenAPI Specification 2.0 - going to translate...`)
    let result: {openapi: Oas3} = await Swagger2OpenAPI.convertObj(spec, {})
    return (result.openapi as Oas3)
  // CASE: validate
  } else if (typeof (spec as Oas3).openapi === 'string'
    && /^3/.test((spec as Oas3).openapi)) {
    logPre(`Received OpenAPI Specification 3.0.x - going to validate...`)
    let valid = OASValidator.validateSync(spec, {})
    if (!valid) {
      throw new Error(`Validation of OpenAPI Specification failed.`)
    }
    logPre(`OpenAPI Specification is validated`)
    return (spec as Oas3)
  } else {
    throw new Error(`Invalid specification provided`)
  }
}

/**
 * Counts the number of operations in an OAS.
 */
export function countOperations (oas: Oas3): number {
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
export function countOperationsQuery (oas: Oas3): number {
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
export function countOperationsMutation (oas: Oas3): number {
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
export function countOperationsWithPayload (oas: Oas3): number {
  let numOps = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (isOperation(method) &&
        typeof oas.paths[path][method].requestBody === 'object') {
        numOps++
      }
    }
  }
  return numOps
}

/**
 * Resolves the given reference in the given object.
 */
export function resolveRef (
  ref: string,
  obj: Object,
  parts?: string[]
): any {
  if (typeof parts === 'undefined') {
    parts = ref.split('/')
  }

  if (parts.length === 0) {
    return obj
  }

  let firstElement = parts.splice(0, 1)[0]
  if (firstElement === '#') {
    return resolveRef(ref, obj, parts)
  }
  if (firstElement in obj) {
    return resolveRef(ref, obj[firstElement], parts)
  } else {
    throw new Error(`Could not resolve reference "${ref}"`)
  }
}

/**
 * From the given OAS, returns the base URL to use for the given operation.
 */
export function getBaseUrl (
  oas: Oas3,
  operation: Operation
): string {
  // check for servers:
  if (!Array.isArray(operation.servers) || operation.servers.length === 0) {
    throw new Error(`No servers defined for operation ` +
      `"${operation.operationId}"`)
  }

  // check for local servers
  if (Array.isArray(operation.servers) && operation.servers.length > 0) {
    let url = buildUrl(operation.servers[0])

    if (Array.isArray(operation.servers) && operation.servers.length > 1) {
      logHttp(`Warning: Randomly selected first server ${url}`)
    }

    return url.replace(/\/$/, '')
  }

  if (Array.isArray(oas.servers) && oas.servers.length > 0) {
    let url = buildUrl(oas.servers[0])

    if (Array.isArray(oas.servers) && oas.servers.length > 1) {
      logHttp(`Warning: Randomly selected first server ${url}`)
    }

    return url.replace(/\/$/, '')
  }

  throw new Error('Cannot find a server to call')
}

/**
 * Returns the default URL for a given OAS server object.
 */
function buildUrl (server: ServerObject): string {
  let url = server.url
  // necessary?
  if (typeof server.variables === 'object' &&
  Object.keys(server.variables).length > 0) {
    for (let variableKey in server.variables) {
      // check for default? Would be invalid OAS
      url = url.replace(`{${variableKey}}`,
        server.variables[variableKey].default.toString())
    }
  }

  return url
}

/**
 * Returns object | array where all object keys are sanitized. Keys passed in
 * exceptions are not sanitized.
 */
export function sanitizeObjKeys (
  obj: Object | Array<any>,
  exceptions: string[] = []
): Object | Array<any> {
  const cleanKeys = (obj: Object | Array<any>): Object | Array<any> => {
    if (obj === null || typeof obj === 'undefined') {
      return null
    } else if (Array.isArray(obj)) {
      return obj.map(cleanKeys)
    } else if (typeof obj === 'object') {
      let res: Object = {}
      for (let key in obj) {
        if (!exceptions.includes(key)) {
          let saneKey = beautify(key)
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
export function desanitizeObjKeys (
  obj: Object | Array<any>,
  mapping: Object = {}
): Object | Array<any> {
  const replaceKeys = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(replaceKeys)
    } else if (typeof obj === 'object') {
      let res = {}
      for (let key in obj) {
        if (key in mapping) {
          let rawKey = mapping[key]
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
export function instantiatePathAndGetQuery (
  path: string,
  parameters: ParameterObject[],
  args: Object // NOTE: argument keys are sanitized!
): {
  path: string,
  query: {[key: string]: string},
  headers: {[key: string]: string}
} {
  let query = {}
  let headers = {}

  // case: nothing to do
  if (Array.isArray(parameters)) {
    // iterate parameters:
    for (let param of parameters) {

      let sanitizedParamName = beautify(param.name)
      if (sanitizedParamName && sanitizedParamName in args) {
        switch (param.in) {
          // path parameters
          case 'path':
            path = path.replace(`{${param.name}}`, args[sanitizedParamName])
            break

          // query parameters
          case 'query':
            query[param.name] = args[sanitizedParamName]
            break

          // header parameters
          case 'header':
            headers[param.name] = args[sanitizedParamName]
            break

          // cookie parameters
          case 'cookie':
            if (!('cookie' in headers)) {
              headers['cookie'] = ''
            }

            headers['cookie'] += `${param.name}=${args[sanitizedParamName]}; `
            break

          default:
            logHttp(`Warning: The parameter location "${param.in}" in the ` +
              `parameter "${param.name}" of operation "${path}" is not supported`)
        }
      } else {
        logHttp(`Warning: The parameter "${param.name}" of operation "${path}" ` +
          `could not be found`)
      }
    }
  }

  return { path, query, headers }
}

/**
 * Returns the "type" of the given JSON schema. Makes best guesses if the type
 * is not explicitly defined.
 */
export function getSchemaType (schema: SchemaObject): string | null {
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

    // if there are no properties:
    if (typeof schema.properties === 'undefined' ||
      Object.keys(schema.properties).length === 0) {
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
export function inferResourceNameFromPath (path: string): string {
  let name = ''
  let parts = path.split('/')
  parts.forEach((part, i) => {
    if (!/{|}/g.test(part)) {
      let partClean = sanitize(parts[i])
      if (i === 0) {
        name += partClean
      } else {
        name += partClean.charAt(0).toUpperCase() + partClean.slice(1)
      }
    }
  })

  return name
}

/**
 * Returns JSON-compatible schema required by the given endpoint - or null if it
 * does not exist.
 */
export function getRequestSchema (
  endpoint: OperationObject,
  oas: Oas3
): { payloadContentType: string, payloadSchema: SchemaObject } | null {
  if (typeof endpoint.requestBody === 'object') {
    let requestBody: RequestBodyObject | ReferenceObject = endpoint.requestBody

    // make sure we have a RequestBodyObject:
    if (typeof (requestBody as ReferenceObject).$ref === 'string') {
      requestBody = (resolveRef((requestBody as ReferenceObject).$ref, oas) as RequestBodyObject)
    } else {
      requestBody = ((requestBody as any) as RequestBodyObject)
    }

    if (typeof requestBody.content === 'object') {
      let content : MediaTypesObject = requestBody.content

      // Prioritizes content-type JSON
      if (Object.keys(content).includes('application/json')) {
        return { payloadContentType: 'application/json', payloadSchema: content['application/json'].schema as SchemaObject }
      } else {

        // Picks a random content type
        for (let contentType in content) {
          return { payloadContentType: contentType, payloadSchema: content[contentType].schema as SchemaObject }
          }
        }
      }
    }
    return { payloadContentType: null, payloadSchema: null }
  }


/**
 * Returns the request schema (if any) for endpoint at given path and method, a
 * dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
export function getRequestSchemaAndNames (
  path: string,
  method: string,
  oas: Oas3
): RequestSchemaAndNames {
  let endpoint: OperationObject = oas.paths[path][method]
  let payloadRequired = false
  let payloadSchemaNames: any = {}
  let { payloadContentType, payloadSchema } = getRequestSchema(endpoint, oas)

  if (payloadSchema) {
    let requestBody = endpoint.requestBody

    // determine if request body is required:
    if (typeof requestBody === 'object') {
      // resolve reference if needed:
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

    // if request body content-type is not application/json, do not parse.
    // interpret the request body as a string
    if (payloadContentType !== 'application/json') {
      let saneContentTypeName: string = ''
      let terms = payloadContentType.split('/')
      for (let index in terms) {
        saneContentTypeName += terms[index].charAt(0).toUpperCase() + terms[index].slice(1)
      }

      payloadSchemaNames = {
        fromPath: saneContentTypeName
      }

      let description = payloadContentType + ' request placeholder object'

      if ('description' in payloadSchema && typeof(payloadSchema['description']) === 'string') {
        description += `\n\nOriginal top level description: ${payloadSchema['description']}`
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
export function getResponseSchema (
  endpoint: OperationObject,
  statusCode: string,
  oas: Oas3
): { responseContentType: string, responseSchema: SchemaObject } | null {
  if (typeof endpoint.responses === 'object') {
    let responses: ResponsesObject = endpoint.responses
    if (typeof responses[statusCode] === 'object') {
      let response: ResponseObject | ReferenceObject = responses[statusCode]

      // make sure we have a ResponseObject:
      if (typeof (response as ReferenceObject).$ref === 'string') {
        response = (resolveRef((response as ReferenceObject).$ref, oas) as ResponseObject)
      } else {
        response = ((response as any) as ResponseObject)
      }

      if (response.content && typeof response.content !== 'undefined') {
        let content : MediaTypesObject = response.content

        // Prioritizes content-type JSON
        if (Object.keys(content).includes('application/json')) {
          return { responseContentType: 'application/json', responseSchema: content['application/json'].schema as SchemaObject }
        } else {

          // Picks a random content type
          for (let contentType in content) {
            return { responseContentType: contentType, responseSchema: content[contentType].schema as SchemaObject }
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
export function getResponseSchemaAndNames (
  path: string,
  method: string,
  oas: Oas3,
  data: PreprocessingData,
  options: Options
): ResponseSchemaAndNames {
  let endpoint: OperationObject = oas.paths[path][method]
  let responseSchemaNames: any = {}
  let statusCode = getResponseStatusCode(path, method, oas, data)
  if (!statusCode) {
    return {}
  }
  let { responseContentType, responseSchema } = getResponseSchema(endpoint, statusCode, oas)

  if (responseSchema) {
    responseSchemaNames.fromPath = inferResourceNameFromPath(path)

    if ('$ref' in responseSchema) {
      responseSchemaNames.fromRef = responseSchema['$ref'].split('/').pop()
      responseSchema = resolveRef(responseSchema['$ref'], oas)
    }
    if ('title' in responseSchema) {
      responseSchemaNames.fromSchema = responseSchema.title
    }

    // if request body content-type is not application/json, do not parse.
    // interpret the request body as a string
    if (responseContentType !== 'application/json') {
      let description = 'Placeholder object to access non-application/json ' +
      'response bodies'

      if ('description' in responseSchema && typeof(responseSchema['description']) === 'string') {
        description += `\n\nOriginal top level description: ${responseSchema['description']}`
      }

      responseSchema = {
        description: description,
        type: 'string'
      }
    }

    return {
      responseContentType,
      responseSchema,
      responseSchemaNames
    }
  } else {

    /**
     * 204 is a special case in which a successful call does not return a 
     * response. GraphQL does not support that kind of functionality so by
     * default, these operations will be ignored.
     * 
     * However, if the following condition is true, then OASGraph will inject
     * a placeholder response schema. 
     */
    if (statusCode === '204' && options.fillEmptyResponses) {
      return {
        responseSchemaNames: {
          fromPath: inferResourceNameFromPath(path),
        }, 
        responseContentType: 'application/json',
        responseSchema: {
          description: 'Placeholder object to support operations with no response schema',
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
export function getResponseStatusCode (
  path: string,
  method: string,
  oas: Oas3,
  data: PreprocessingData
): string | void {
  let endpoint: OperationObject = oas.paths[path][method]

  if (typeof endpoint.responses === 'object') {
    let codes = Object.keys(endpoint.responses)
    let successCodes = codes.filter(code => {
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
        log
      })
      return successCodes[0]
    }
  }
  return null
}

/**
 * Returns an hash containing the links defined in the given endpoint.
 */
export function getEndpointLinks (
  path: string,
  method: string,
  oas: Oas3,
  data: PreprocessingData
): {[key: string]: LinkObject} {
  let links = {}
  let endpoint: OperationObject = oas.paths[path][method]
  let statusCode = getResponseStatusCode(path, method, oas, data)
  if (!statusCode) {
    return links
  }
  if (typeof endpoint.responses === 'object') {
    let responses: ResponsesObject = endpoint.responses
    if (typeof responses[statusCode] === 'object') {
      let response: ResponseObject | ReferenceObject = responses[statusCode]

      if (typeof (response as ReferenceObject).$ref === 'string') {
        response = (resolveRef((response as ReferenceObject).$ref, oas) as ResponseObject)
      }

      // here, we can be ceratain we have a ResponseObject:
      response = ((response as any) as ResponseObject)

      if (typeof response.links === 'object') {
        let epLinks: LinksObject = response.links
        for (let linkKey in epLinks) {
          let link: LinkObject | ReferenceObject = epLinks[linkKey]

          // make sure we have LinkObjects:
          if (typeof (link as ReferenceObject).$ref === 'string') {
            link = resolveRef(link['$ref'], oas)
          } else {
            link = ((link as any) as LinkObject)
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
export function getParameters (
  path: string,
  method: string,
  oas: Oas3
): ParameterObject[] {
  let parameters = []

  if (!isOperation(method)) {
    log(`Warning: attempted to get parameters for ${method} ${path}, ` +
      `which is not an operation.`)
    return parameters
  }

  let pathItemObject: PathItemObject = oas.paths[path]

  let pathParams = pathItemObject.parameters

  // first, consider parameters in Path Item Object:
  if (Array.isArray(pathParams)) {
    let pathItemParameters: ParameterObject[] = pathParams.map(p => {
      if (typeof (p as ReferenceObject).$ref === 'string') {
        // here we know we have a parameter object:
        return (resolveRef(p['$ref'], oas) as ParameterObject)
      } else {
        // here we know we have a parameter object:
        return ((p as any) as ParameterObject)
      }
    })
    parameters = parameters.concat(pathItemParameters)
  }

  // second, consider parameters in Operation Object:
  let opObject: OperationObject = oas.paths[path][method]

  let opObjectParameters = opObject.parameters

  if (Array.isArray(opObjectParameters)) {
    let opParameters: ParameterObject[] = opObjectParameters.map(p => {
      if (typeof (p as ReferenceObject).$ref === 'string') {
        // here we know we have a parameter object:
        return (resolveRef(p['$ref'], oas) as ParameterObject)
      } else {
        // here we know we have a parameter object:
        return ((p as any) as ParameterObject)
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
export function getServers (
  path: string,
  method: string,
  oas: Oas3
): ServerObject[] {
  let servers = []
  // global server definitions:
  if (Array.isArray(oas.servers) && oas.servers.length > 0) {
    servers = oas.servers
  }

  // path item server definitions override global:
  let pathItem = oas.paths[path]
  if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) {
    servers = pathItem.servers
  }

  // operation server definitions override path item:
  let operationObj = pathItem[method]
  if (Array.isArray(operationObj.servers) && operationObj.servers.length > 0) {
    servers = operationObj.servers
  }

  // default, in case there is no server:
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
export function getSecuritySchemes (
  oas: Oas3
): {[key: string]: SecuritySchemeObject} {
  // collect all security schemes:
  let securitySchemes: {[key: string]: SecuritySchemeObject} = {}
  if (typeof oas.components === 'object' &&
  typeof oas.components.securitySchemes === 'object') {
    for (let schemeKey in oas.components.securitySchemes) {
      let obj = oas.components.securitySchemes[schemeKey]

      // ensure we have actual SecuritySchemeObject:
      if (typeof (obj as ReferenceObject).$ref === 'string') {
        // result of resolution will be SecuritySchemeObject:
        securitySchemes[schemeKey] =
          (resolveRef((obj as ReferenceObject).$ref, oas) as SecuritySchemeObject)
      } else {
        // we already have a SecuritySchemeObject:
        securitySchemes[schemeKey] = ((obj as any) as SecuritySchemeObject)
      }
    }
  }
  return securitySchemes
}

/**
 * Returns the list of BEAUTIFIED keys of NON-OAUTH 2 security schemes
 * required by the operation at the given path and method.
 */
export function getSecurityRequirements (
  path: string,
  method: string,
  securitySchemes: {[key: string]: SecuritySchemeObject},
  oas: Oas3
): string[] {
  let results: string[] = []

  // first, consider global requirements:
  let globalSecurity: SecurityRequirementObject[] = oas.security
  if (globalSecurity && typeof globalSecurity !== 'undefined') {
    for (let secReq of globalSecurity) {
      for (let schemaKey in secReq) {
        if (securitySchemes[schemaKey] &&
          typeof securitySchemes[schemaKey] === 'object' &&
          securitySchemes[schemaKey].type !== 'oauth2') {
          results.push(schemaKey)
        }
      }
    }
  }

  // local:
  let operation: OperationObject = oas.paths[path][method]
  let localSecurity: SecurityRequirementObject[] = operation.security
  if (localSecurity && typeof localSecurity !== 'undefined') {
    for (let secReq of localSecurity) {
      for (let schemaKey in secReq) {
        if (securitySchemes[schemaKey] &&
          typeof securitySchemes[schemaKey] === 'object' &&
          securitySchemes[schemaKey].type !== 'oauth2') {
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
 * Beautifies the given string and stores the sanitized-to-original mapping in
 * the given mapping.
 */
export function beautifyAndStore (
  str: string,
  mapping: {[key: string]: string}
): string {
  if (!(typeof mapping === 'object')) {
    throw new Error(`No/invalid mapping passed to beautifyAndStore`)
  }
  let clean = beautify(str)
  if (!clean) {
    throw new Error(`Cannot beautifyAndStore ${str}`)
  } else if (clean !== str) {
    if (clean in mapping && str !== mapping[clean]) {
      log(`Warning: "${str}" and "${mapping[clean]}" both sanitize ` +
        `to ${clean} - collusion possible. Desanitize to ${str}.`)
    }
    mapping[clean] = str
  }
  return clean
}

/**
 * First sanitizes given string and then also camel-cases it.
 */
export function beautify (
  str: string,
  lowercaseFirstChar: boolean = true
): string {
  // only apply to strings:
  if (typeof str !== 'string') {
    throw new Error(`Cannot beautify "${str}" of type "${typeof str}"`)
  }

  let charToRemove = '_'
  let sanitized = sanitize(str)
  while (sanitized.indexOf(charToRemove) !== -1) {
    let pos = sanitized.indexOf(charToRemove)
    if (sanitized.length >= pos + 2) {
      sanitized = sanitized.slice(0, pos) +
        sanitized.charAt(pos + 1).toUpperCase() +
        sanitized.slice(pos + 2, sanitized.length)
    } else if (sanitized.length === pos + 1) {
      sanitized = sanitized.slice(0, pos) +
        sanitized.charAt(pos + 1).toUpperCase()
    } else {
      sanitized = sanitized.slice(0, pos)
    }
  }

  // special case: we cannot start with number, and cannot be empty:
  if (/^[0-9]/.test(sanitized) || sanitized === '') {
    sanitized = '_' + sanitized
  }

  // first character should be lowercase
  if (lowercaseFirstChar) {
    sanitized = sanitized.charAt(0).toLowerCase() +
    sanitized.slice(1, sanitized.length)
  }

  return sanitized
}

/**
 * Sanitizes the given string so that it can be used as the name for a GraphQL
 * Object Type.
 */
function sanitize (str: string): string {
  let clean = str.replace(/[^_a-zA-Z0-9]/g, '_')
  return clean
}

/**
 * Stringifies and possibly trims the given string to the provided length.
 */
export function trim (str: string, length: number): string {
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
export function isOperation (method: string): boolean {
  return OAS_OPERATIONS.includes(method.toLowerCase())
}
