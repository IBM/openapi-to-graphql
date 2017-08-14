/* @flow */

'use strict'

/**
 * Utility functions around the OpenAPI Specification 3.
 */

// Type imports:
import type {Oas2} from './types/oas2.js'
import type {Operation} from './types/operation.js'
import type {
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

// Type definitions & exports:
export type SchemaNames = {
  fromPath?: string,
  fromSchema?: string,
  fromRef?: string
}

export type ReqSchemaAndNames = {
  reqSchema?: SchemaObject | ReferenceObject,
  reqSchemaNames?: SchemaNames,
  reqRequired: boolean
}

export type ResSchemaAndNames = {
  resSchema?: SchemaObject | ReferenceObject,
  resSchemaNames?: SchemaNames
}

// Imports:
import Swagger2OpenAPI from 'swagger2openapi'
import OASValidator from 'swagger2openapi/validate.js'
import deepEqual from 'deep-equal'
import debug from 'debug'
const logHttp = debug('http')
const logPre = debug('preprocessing')

const log = debug('translation')

// OAS constants
const OAS_OPERATIONS = ['get', 'put', 'post', 'delete', 'options', 'head', 'path', 'trace']
const JSON_CONTENT_TYPES = ['application/json', '*/*']
const SUCCESS_STATUS_RX = /2[0-9]{2}/

/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
export function getValidOAS3 (spec: Oas2 | Oas3): Promise<Oas3> {
  return new Promise((resolve, reject) => {
    // CASE: translate
    if (typeof spec.swagger === 'string' && spec.swagger === '2.0') {
      logPre(`Received OpenAPI Specification 2.0 - going to translate...`)
      Swagger2OpenAPI.convertObj(spec, {})
        .then(result => {
          resolve(result.openapi)
        })
        .catch(reject)
    // CASE: validate
    } else if (typeof spec.openapi === 'string' && /^3/.test(spec.openapi)) {
      logPre(`Received OpenAPI Specification 3.0.x - going to validate...`)
      let valid = true
      try {
        valid = OASValidator.validateSync(spec, {})
      } catch (err) {
        reject(err)
      }
      if (!valid) {
        reject(new Error(`Validation of OpenAPI Specification failed.`))
      } else {
        logPre(`OpenAPI Specification is validated`)
        resolve(spec)
      }
    }
  })
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
    throw new Error(`could not resolve reference "${ref}"`)
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
      logHttp(`Warning: randomly selected first server ${url}`)
    }

    return url.replace(/\/$/, '')
  }

  if (Array.isArray(oas.servers) && oas.servers.length > 0) {
    let url = buildUrl(oas.servers[0])

    if (Array.isArray(oas.servers) && oas.servers.length > 1) {
      logHttp(`Warning: randomly selected first server ${url}`)
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
): ?Object | Array<any> {
  const cleanKeys = (obj: ?Object | Array<any>): ?Object | Array<any> => {
    if (!obj) {
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
): ?Object | Array<any> {
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
  query: Object
} {
  let query = {}

  // case: nothing to do
  if (Array.isArray(parameters)) {
    // iterate parameters:
    for (let param: ParameterObject of parameters) {
      let sanitizedParamName = beautify(param.name)

      // path parameters:
      if (param.in === 'path') {
        path = path.replace(`{${param.name}}`, args[sanitizedParamName])
      }

      // query parameters:
      if (param.in === 'query' &&
        sanitizedParamName &&
        sanitizedParamName in args) {
        query[param.name] = args[sanitizedParamName]
      }
    }
  }

  return {path, query}
}

/**
 * Returns the "type" of the given JSON schema. Makes best guesses if the type
 * is not explicitly defined.
 */
export function getSchemaType (schema: SchemaObject): ?string {
  // CASE: enum
  if (Array.isArray(schema.enum)) {
    return 'enum'
  }

  // CASE: object
  if (schema.type === 'object') {
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
 * Returns JSON-compatible schema produced by the given endpoint - or null if it
 * does not exist.
 */
export function getResSchema (
  endpoint: OperationObject,
  statusCode: string,
  oas: Oas3
) : ?SchemaObject {
  if (typeof endpoint.responses === 'object') {
    let responses: ResponsesObject = endpoint.responses
    if (typeof responses[statusCode] === 'object') {
      let response: ResponseObject | ReferenceObject = responses[statusCode]

      // make sure we have a ResponseObject:
      if (typeof response.$ref === 'string') {
        response = (resolveRef(response.$ref, oas) : ResponseObject)
      } else {
        response = ((response: any): ResponseObject)
      }

      if (response.content && typeof response.content !== 'undefined') {
        let content: MediaTypesObject = response.content
        for (let contentType: string in content) {
          let mediaTypeObject = content[contentType]
          if (JSON_CONTENT_TYPES.includes(contentType) &&
            typeof mediaTypeObject.schema === 'object') {
            return mediaTypeObject.schema
          }
        }
      }
    }
  }
  return null
}

/**
 * Returns JSON-compatible schema required by the given endpoint - or null if it
 * does not exist.
 */
export function getReqSchema (
  endpoint: OperationObject,
  oas: Oas3
) : ?SchemaObject {
  if (typeof endpoint.requestBody === 'object') {
    let requestBody: RequestBodyObject | ReferenceObject = endpoint.requestBody

    // make sure we have a RequestBodyObject:
    if (typeof requestBody.$ref === 'string') {
      requestBody = (resolveRef(requestBody.$ref, oas) : RequestBodyObject)
    } else {
      requestBody = ((requestBody: any): RequestBodyObject)
    }

    if (typeof requestBody.content === 'object') {
      let content = requestBody.content
      for (let contentType: string in content) {
        if (JSON_CONTENT_TYPES.includes(contentType) &&
          typeof content[contentType].schema === 'object') {
          return content[contentType].schema
        }
      }
    }
  }
  return null
}

/**
 * Returns the request schema (if any) for endpoint at given path and method, a
 * dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
export function getReqSchemaAndNames (
  path: string,
  method: string,
  oas: Oas3
) : ReqSchemaAndNames {
  let endpoint: OperationObject = oas.paths[path][method]
  let reqRequired = false
  let reqSchemaNames = {}
  let reqSchema: ?SchemaObject = getReqSchema(endpoint, oas)

  if (reqSchema) {
    let requestBody = endpoint.requestBody

    // determine if request body is required:
    if (typeof requestBody === 'object') {
      // resolve reference if needed:
      if (typeof requestBody.$ref === 'string') {
        requestBody = resolveRef(requestBody['$ref'], oas)
      }
      if (typeof requestBody.required === 'boolean') {
        reqRequired = requestBody.required
      }
    }

    reqSchemaNames.fromPath = inferResourceNameFromPath(path)

    if ('$ref' in reqSchema) {
      reqSchemaNames.fromRef = reqSchema['$ref'].split('/').pop()
      reqSchema = resolveRef(reqSchema['$ref'], oas)
    }
    if ('title' in reqSchema) {
      reqSchemaNames.fromSchema = reqSchema.title
    }

    return {
      reqSchema,
      reqSchemaNames,
      reqRequired
    }
  }
  return {
    reqRequired: false
  }
}

/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 */
export function getResSchemaAndNames (
  path: string,
  method: string,
  oas: Oas3
) : ResSchemaAndNames {
  let endpoint: OperationObject = oas.paths[path][method]
  let resSchemaNames = {}
  let statusCode = getResStatusCode(path, method, oas)
  if (!statusCode) {
    return {}
  }
  let resSchema = getResSchema(endpoint, statusCode, oas)

  if (resSchema) {
    resSchemaNames.fromPath = inferResourceNameFromPath(path)

    if ('$ref' in resSchema) {
      resSchemaNames.fromRef = resSchema['$ref'].split('/').pop()
      resSchema = resolveRef(resSchema['$ref'], oas)
    }
    if ('title' in resSchema) {
      resSchemaNames.fromSchema = resSchema.title
    }

    return {
      resSchema,
      resSchemaNames
    }
  } else {
    return {}
  }
}

/**
 * Returns the success status code for the operation at the given path and
 * method (or null).
 */
export function getResStatusCode (
  path: string,
  method: string,
  oas: Oas3
) : ?string {
  let endpoint: OperationObject = oas.paths[path][method]

  if (typeof endpoint.responses === 'object') {
    let codes = Object.keys(endpoint.responses)
    let successCodes = codes.filter(code => {
      return SUCCESS_STATUS_RX.test(code)
    })
    if (successCodes.length === 1) {
      return successCodes[0]
    } else if (successCodes.length > 1) {
      log(`Warning: operation ${method.toUpperCase()} ${path} has more than ` +
        `one success status code (200 - 299) - use ${successCodes[0]}`)
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
  oas: Oas3
) : {[string]: LinkObject} {
  let links = {}
  let endpoint: OperationObject = oas.paths[path][method]
  let statusCode = getResStatusCode(path, method, oas)
  if (!statusCode) {
    return links
  }
  if (typeof endpoint.responses === 'object') {
    let responses: ResponsesObject = endpoint.responses
    if (typeof responses[statusCode] === 'object') {
      let response: ResponseObject | ReferenceObject = responses[statusCode]

      if (typeof response.$ref === 'string') {
        response = (resolveRef(response.$ref, oas) : ResponseObject)
      }

      // here, we can be ceratain we have a ResponseObject:
      response = ((response: any): ResponseObject)

      if (typeof response.links === 'object') {
        let epLinks: LinksObject = response.links
        for (let linkKey in epLinks) {
          let link: LinkObject | ReferenceObject = epLinks[linkKey]

          // make sure we have LinkObjects:
          if (typeof link.$ref === 'string') {
            link = resolveRef(link['$ref'], oas)
          } else {
            link = ((link: any): LinkObject)
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
) : ParameterObject[] {
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
      if (typeof p.$ref === 'string') {
        // here we know we have a parameter object:
        return (resolveRef(p['$ref'], oas) : ParameterObject)
      } else {
        // here we know we have a parameter object:
        return ((p: any): ParameterObject)
      }
    })
    parameters = parameters.concat(pathItemParameters)
  }

  // second, consider parameters in Operation Object:
  let opObject: OperationObject = oas.paths[path][method]

  let opObjectParameters = opObject.parameters

  if (Array.isArray(opObjectParameters)) {
    let opParameters: ParameterObject[] = opObjectParameters.map(p => {
      if (typeof p.$ref === 'string') {
        // here we know we have a parameter object:
        return (resolveRef(p['$ref'], oas) : ParameterObject)
      } else {
        // here we know we have a parameter object:
        return ((p: any): ParameterObject)
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
) : ServerObject[] {
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
) : {[string]: SecuritySchemeObject} {
  // collect all security schemes:
  let securitySchemes: {[string]: SecuritySchemeObject} = {}
  if (typeof oas.components === 'object' &&
  typeof oas.components.securitySchemes === 'object') {
    for (let schemeKey in oas.components.securitySchemes) {
      let obj = oas.components.securitySchemes[schemeKey]

      // ensure we have actual SecuritySchemeObject:
      if (typeof obj.$ref === 'string') {
        // result of resolution will be SecuritySchemeObject:
        securitySchemes[schemeKey] =
          (resolveRef(obj.$ref, oas): SecuritySchemeObject)
      } else {
        // we already have a SecuritySchemeObject:
        securitySchemes[schemeKey] = ((obj: any): SecuritySchemeObject)
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
  securitySchemes: {[string]: SecuritySchemeObject},
  oas: Oas3
) : string[] {
  let results: string[] = []

  // first, consider global requirements:
  let globalSecurity: ?SecurityRequirementObject[] = oas.security
  if (globalSecurity && typeof globalSecurity !== 'undefined') {
    for (let secReq: SecurityRequirementObject of globalSecurity) {
      for (let schemaKey: string in secReq) {
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
  let localSecurity: ?SecurityRequirementObject[] = operation.security
  if (localSecurity && typeof localSecurity !== 'undefined') {
    for (let secReq: SecurityRequirementObject of localSecurity) {
      for (let schemaKey: string in secReq) {
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
  mapping: {[string]: string}
) : string {
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
export function beautify (str: string): string {
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
  sanitized = sanitized.charAt(0).toLowerCase() +
  sanitized.slice(1, sanitized.length)

  return sanitized
}

/**
 * Sanitizes the given string so that it can be used as the name for a GraphQL
 * Object Type.
 */
function sanitize (str: string) : string {
  let clean = str.replace(/[^_a-zA-Z0-9]/g, '_')
  return clean
}

/**
 * Stringifies and possibly trims the given string to the provided length.
 */
export function trim (str: string, length: number) : string {
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
export function isOperation (method: string) : boolean {
  return OAS_OPERATIONS.includes(method.toLowerCase())
}

/**
 * Aggregates the subschemas in the allOf field into the mother schema
 * Please note that the allOfSchema may not necessarily be an element of the
 * mother schema. The purpose of this construction is to resolve nested allOf
 * schemas inside references.
 *
 * TODO: Tidy this up and return aggregated schema, rather than changing the OAS
 *
 * TODO: Output may not be a SchemaObject
 */
export function resolveAllOf (
  schema: SchemaObject,
  oas: Oas3
): SchemaObject {
  if ('allOf' in schema && typeof schema.allOf === 'object') {
    // copy the original schema
    // let temp = Object.assign({}, schema)

    let temp = JSON.parse(JSON.stringify(schema))

    // remove the allOf property
    delete temp.allOf
    // add the allOf properties and return
    return resolveAllOfRec(temp, schema.allOf, oas)
  } else {
    throw new Error(`schema '${JSON.stringify(schema)}' does not contain an 'allOf' property`)
  }
}

function resolveAllOfRec (
  resolvedSchema: Object,
  allOfSchema: SchemaObject,
  oas: Oas3
): Object {
  for (let allOfSchemaIndex in allOfSchema) {
    let subschema = allOfSchema[allOfSchemaIndex]

    // resolve the reference if applicable
    if ('$ref' in subschema) {
      subschema = resolveRef(subschema.$ref, oas)
    }

    // iterate through all the subschema keys
    Object.keys(subschema).forEach(subschemaKey => {
      switch (subschemaKey) {
        case 'type':
          // TODO: strict?
          if (typeof resolvedSchema.type === 'string' &&
            resolvedSchema.type !== subschema.type) {
            /**
             * if the schema is an object type but does not contain a properties
             * field, than we can overwrite the type because a schema with
             * an object tye and no properties field is equivalent to an empty
             * schema
             */
            if (resolvedSchema.type === 'object' && !('properties' in resolvedSchema)) {
              resolvedSchema.type = subschema.type
            } else {
              throw new Error(`allOf will overwrite a preexisting type ` +
                `definition 'type: ${resolvedSchema.type}' with 'type: ` +
                `${subschema.type}' in schema '${JSON.stringify(resolvedSchema)}'`)
            }
          } else {
            resolvedSchema.type = subschema.type
          }
          break

        case 'properties':
          // imply type object from properties field
          if (!(typeof resolvedSchema.type === 'string')) {
            resolvedSchema.type = 'object'
          // cannot replace an object type with a scalar or array type
          } else if (resolvedSchema.type !== 'object') {
            throw new Error(`allOf will overwrite a preexisting type ` +
              `definition 'type: ${resolvedSchema.type}' with 'type: object' in ` +
              `schema '${JSON.stringify(resolvedSchema)}'`)
          }

          let properties = subschema.properties

          let propertyNames = Object.keys(properties)

          if (!('properties' in resolvedSchema)) {
            resolvedSchema.properties = {}
          }

          for (let propertyName of propertyNames) {
            if (!(propertyName in resolvedSchema.properties)) {
              resolvedSchema.properties[propertyName] = properties[propertyName]

            // check if the preexisting schema is the same
            } else if (!deepEqual(resolvedSchema.properties[propertyName], subschema.properties[propertyName])) {
              throw new Error(`allOf will overwrite a preexisting property ` +
                `'${propertyName}: ${JSON.stringify(resolvedSchema.properties[propertyName])}' ` +
                `with '${propertyName}: ${JSON.stringify(subschema.properties[propertyName])}' ` +
                `in schema '${JSON.stringify(resolvedSchema)}`)
            }
          }
          break

        case 'items':
          // imply type array from items field
          if (!(typeof resolvedSchema.type === 'string')) {
            resolvedSchema.type = 'array'
          // cannot replace an array type with a scalar or object type
          } else if (resolvedSchema.type !== 'array') {
            throw new Error(`allOf will overwrite a preexisting type definition` +
              `'type: ${resolvedSchema.type}' with 'type: array' in schema '${JSON.stringify(resolvedSchema)}'`)
          }
          if (!('items' in resolvedSchema)) {
            resolvedSchema.items = {}
          }

          for (let itemIndex in subschema.items) {
            resolvedSchema.items = subschema.items[itemIndex]
          }
          break

        case 'allOf':
          resolveAllOfRec(resolvedSchema, subschema.allOf, oas)
          break

        default:
          log(`allOf contains currently unsupported element'${subschemaKey}'`)
      }
    })
  }
  return resolvedSchema
}
