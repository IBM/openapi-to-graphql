/* @flow */

'use strict'

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
  SecuritySchemesObject,
  SecuritySchemeObject,
  SecurityRequirementObject
} from './types/oas3.js'
import type {Oas2} from './types/oas2.js'
import type {Operation} from './types/operation.js'

const deepEqual = require('deep-equal')
const Swagger2OpenAPI = require('swagger2openapi')
const OASValidator = require('swagger2openapi/validate.js')

const logHttp = require('debug')('http')
const logPre = require('debug')('preprocessing')
const log = require('debug')('translation')

/**
 * OAS constants
 */
const OAS_OPERATIONS = ['get', 'put', 'post', 'delete', 'options', 'head', 'path', 'trace']
const JSON_CONTENT_TYPES = ['application/json', '*/*']
const SUCCESS_STATUS_RX = /2[0-9]{2}/

const getValidOAS3 = (spec: Oas2 | Oas3): Promise<Oas3> => {
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
 *
 * @param  {string} ref   A reference, for example "#/components/schemas/user"
 * @param  {object} obj   Object to resolve reference in, for example an OAS
 * @param  {array}  parts (Optional) List of remaining ref. parts to resolve
 * @return {object}       Resolved object
 */
const resolveRef = (ref: string, obj: Object, parts?: string[]): any => {
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
const getBaseUrl = (oas: Oas3, operation: Operation): string => {
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
const buildUrl = (server: ServerObject): string => {
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
const sanitizeObjKeys = (
  obj: Object | Array<any>,
  exceptions: string[] = []
): ?Object | Array<any> => {
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
const desanitizeObjKeys = (
  obj: Object | Array<any>,
  mapping: Object = {}
): ?Object | Array<any> => {
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
const instantiatePathAndGetQuery = (
  path: string,
  parameters: ParameterObject[],
  args: Object // NOTE: argument keys are sanitized!
): {
  path: string,
  query: Object
} => {
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
const getSchemaType = (schema: SchemaObject): ?string => {
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
const inferResourceNameFromPath = (path: string): string => {
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
const getResSchema = (
  endpoint: OperationObject,
  statusCode: string,
  oas: Oas3
) : ?SchemaObject => {
  if (typeof endpoint.responses === 'object') {
    let responses: ResponsesObject = endpoint.responses
    if (typeof responses[statusCode] === 'object') {
      let response: ResponseObject | ReferenceObject = responses[statusCode]
      if (typeof response.$ref === 'string') {
        response = (resolveRef(response.$ref, oas) : ResponseObject)
      }
      if (typeof response.content !== 'undefined') {
        let content = response.content
        for (let contentType in content) {
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
const getReqSchema = (
  endpoint: OperationObject,
  oas: Oas3
) : ?SchemaObject => {
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

type ReqSchemaAndNames = {
  reqSchema?: SchemaObject | ReferenceObject,
  reqSchemaNames?: {fromPath: string, fromSchema: string, fromRef: string},
  reqRequired?: boolean
}

/**
 * Returns the request schema (if any) for endpoint at given path and method, a
 * dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
const getReqSchemaAndNames = (
  path: string,
  method: string,
  oas: Oas3
) : ReqSchemaAndNames => {
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
  return {}
}

type ResSchemaAndNames = {
  resSchema?: SchemaObject | ReferenceObject,
  resSchemaNames?: {fromPath: string, fromSchema: string, fromRef: string}
}

/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 */
const getResSchemaAndNames = (
  path: string,
  method: string,
  oas: Oas3
) : ResSchemaAndNames => {
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
const getResStatusCode = (
  path: string,
  method: string,
  oas: Oas3
) : ?string => {
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
const getEndpointLinks = (
  path: string,
  method: string,
  oas: Oas3
) : ?{[string]: LinkObject} => {
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
          if (typeof link.$ref === 'string') {
            link = resolveRef(link['$ref'], oas)
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
 * Resolves referenced parameters if needed.
 */
const getParameters = (
  path: string,
  method: string,
  oas: Oas3
) : ParameterObject[] => {
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
 * Returns a map of strings to the Security Scheme definitions. Resolves
 * possible references.
 */
const getSecuritySchemes = (oas: Oas3) : {[string]: SecuritySchemeObject} => {
  // collect all security schemes:
  let securitySchemes: {[string]: SecuritySchemeObject} = {}
  if (typeof oas.components === 'object' &&
  typeof oas.components.securitySchemes === 'object') {
    for (let schemeKey in oas.components.securitySchemes) {
      let obj = oas.components.securitySchemes[schemeKey]

      // ensure we have actual SecuritySchemeObject:
      if (typeof obj.$ref === 'string') {
        // result of resolution will be SecuritySchemeObject:
        securitySchemes[schemeKey] = ((resolveRef(obj.$ref, oas): any): SecuritySchemeObject)
      } else {
        // we already have a SecuritySchemeObject:
        securitySchemes[schemeKey] = ((obj: any): SecuritySchemeObject)
      }
    }
  }
  return securitySchemes
}

/**
 * Returns the list of security protocols required by the operation at the given
 * path and method. Resolves referenced parameters if needed.
 */
const getSecurityRequirements = (
  path: string,
  method: string,
  securitySchemes: {[string]: SecuritySchemeObject},
  oas: Oas3
) : string[] => {
  let results: string[] = []

  // first, consider global requirements:
  let globalSecurity: ?SecurityRequirementObject[] = oas.security
  if (globalSecurity && typeof globalSecurity !== 'undefined') {
    for (let secReq: SecurityRequirementObject of globalSecurity) {
      for (let schemaKey: string in secReq) {
        let cleanSchemaKey = beautify(schemaKey)
        if (typeof cleanSchemaKey === 'string') {
          if (securitySchemes[cleanSchemaKey] &&
            typeof securitySchemes[cleanSchemaKey] === 'object' &&
            securitySchemes[cleanSchemaKey].type !== 'oauth2') {
            results.push(cleanSchemaKey)
          }
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
        let cleanSchemaKey = beautify(schemaKey)
        if (typeof cleanSchemaKey === 'string') {
          if (securitySchemes[cleanSchemaKey] &&
            typeof securitySchemes[cleanSchemaKey] === 'object' &&
            securitySchemes[cleanSchemaKey].type !== 'oauth2') {
            if (!results.includes(cleanSchemaKey)) {
              results.push(cleanSchemaKey)
            }
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
const beautifyAndStore = (
  str: string,
  mapping: {[string]: string}
) : string => {
  if (!(typeof mapping === 'object')) {
    throw new Error(`No/invalid mapping passed to beautifyAndStore`)
  }
  let clean = beautify(str)
  if (!clean) {
    throw new Error(`Cannot beautifyAndStore ${str}`)
  } else if (clean !== str) {
    if (clean in mapping && str !== mapping[clean]) {
      console.warn(`Warning: "${str}" and "${mapping[clean]}" both sanitize ` +
        `to ${clean} - collusion possible. Desanitize to ${str}.`)
    }
    mapping[clean] = str
  }
  return clean
}

/**
 * First sanitizes given string and then also camel-cases it.
 */
const beautify = (str: string): ?string => {
  // only apply to strings:
  if (typeof str !== 'string') return null

  let charToRemove = '_'
  let sanitized = sanitize(str)
  while (sanitized.indexOf(charToRemove) !== -1) {
    let pos = sanitized.indexOf(charToRemove)
    if (sanitized.length >= pos + 2) {
      sanitized = sanitized.slice(0, pos) +
        sanitized.charAt(pos + 1).toUpperCase() +
        sanitized.slice(pos + 2, sanitized.length)
    } else if (sanitized.length === pos + 1) {
      sanitized = sanitized.slice(0, pos) + sanitized.charAt(pos + 1).toUpperCase()
    } else {
      sanitized = sanitized.slice(0, pos)
    }
  }

  // special case: we cannot start with number, and cannot be empty:
  if (/^[0-9]/.test(sanitized) || sanitized === '') {
    sanitized = '_' + sanitized
  }

  return sanitized
}

/**
 * Sanitizes the given string so that it can be used as the name for a GraphQL
 * Object Type.
 */
const sanitize = (str: string) : string => {
  let clean = str.replace(/[^_a-zA-Z0-9]/g, '_')
  return clean
}

/**
 * Stringifies and possibly trims the given string to the provided length.
 */
const trim = (str: string, length: number) : string => {
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
const isOperation = (method: string) : boolean => {
  return OAS_OPERATIONS.includes(method.toLowerCase())
}

module.exports = {
  getValidOAS3,
  resolveRef,
  getBaseUrl,
  instantiatePathAndGetQuery,
  getSchemaType,
  inferResourceNameFromPath,
  getReqSchemaAndNames,
  getResSchemaAndNames,
  getEndpointLinks,
  getParameters,
  getSecuritySchemes,
  getSecurityRequirements,
  sanitizeObjKeys,
  desanitizeObjKeys,
  beautify,
  beautifyAndStore,
  trim,
  isOperation
}
