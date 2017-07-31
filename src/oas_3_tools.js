'use strict'

const mutationMethods = ['post', 'put', 'patch', 'delete']
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

const getValidOAS3 = (spec) => {
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
const resolveRef = (ref, obj, parts) => {
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
 * Returns an appropriate url for a given OAS and operation.
 *
 * @param  {object} oas
 * @param  {object} operation
 * @return {string}     URL
 */
const getBaseUrl = (oas, operation) => {
  // check for local servers
  if (typeof operation.servers === 'object' && Object.keys(operation.servers).length > 0) {
    let url = buildUrl(operation.servers[0])

    if (Object.keys(operation.servers).length > 1) {
      logHttp(`Warning: randomly selected first server ${url}`)
    }

    return url.replace(/\/$/, '')
  }

  if (typeof oas.servers === 'object' && Object.keys(oas.servers).length > 0) {
    let url = buildUrl(oas.servers[0])

    if (Object.keys(oas.servers).length > 1) {
      logHttp(`Warning: randomly selected first server ${url}`)
    }

    return url.replace(/\/$/, '')
  }

  throw new Error('Cannot find a server to call')
}

/**
 * Returns the default URL for a given OAS server object
 *
 * @param  {object} server
 * @return {string}     URL
 */
const buildUrl = (server) => {
  let url = server.url
  // necessary?
  if (typeof server.variables === 'object' && Object.keys(server.variables).length > 0) {
    for (let variableKey in server.variables) {
      // check for default? Would be invalid OAS
      // url = url.replace(`{${variableKey}}`, `${server.variables[variableKey].default}`)
      url = url.replace(`{${variableKey}}`, server.variables[variableKey].default.toString())
    }
  }

  return url
}

/**
 * Returns object | array where all object keys are sanitized. Keys passed in
 * exceptions are not sanitized.
 *
 * @param  {any}    obj        Object | array etc. to sanitize
 * @param  {Array}  exceptions List of keys to leave as is
 * @return {any}
 */
const sanitizeObjKeys = (obj, exceptions = []) => {
  const cleanKeys = (obj) => {
    if (!obj) {
      return null
    } else if (Array.isArray(obj)) {
      return obj.map(cleanKeys)
    } else if (typeof obj === 'object') {
      let res = {}
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
 *
 * @param  {any}    obj     Object | array etc. to desanitize
 * @param  {Object} mapping Key: sanitized key, Value: desanitized value
 * @return {any}
 */
const desanitizeObjKeys = (obj, mapping = {}) => {
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
 *
 * @param  {string} path
 * @param  {object} endpoint
 * @param  {object} args     Arguments. NOTE: argument keys are sanitized!!!
 * @return {string}          Path with parameters replaced by argument values
 */
const instantiatePathAndGetQuery = (path, parameters, args) => {
  // case: nothing to do
  if (!Array.isArray(parameters)) {
    return path
  }

  let query = {}
  // iterate parameters:
  for (let i in parameters) {
    let param = parameters[i]
    let sanitizedParamName = beautify(param.name)

    // path parameters:
    if (param.in === 'path') {
      path = path.replace(`{${param.name}}`, args[sanitizedParamName])
    }

    // query parameters:
    if (param.in === 'query' &&
      sanitizedParamName in args) {
      query[param.name] = args[sanitizedParamName]
    }
  }

  return {path, query}
}

/**
 * Returns the "type" of the given JSON schema. Makes best guesses if the type
 * is not explicitly defined.
 *
 * @param  {object} schema JSON-schema
 * @return {string}        Type of the JSON-schema
 */
const getSchemaType = (schema) => {
  // CASE: enum
  if (Array.isArray(schema.enum)) {
    return 'enum'
  }

  // CASE: object
  if (schema.type === 'object') {
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
 *
 * @param  {string} path
 * @return {string}      Inferred name
 */
const inferResourceNameFromPath = (path) => {
  let name = ''
  let parts = path.split('/')
  for (let i in parts) {
    let part = parts[i]
    if (!/{|}/g.test(part)) {
      let partClean = sanitize(parts[i])
      if (i === 0) {
        name += partClean
      } else {
        name += partClean.charAt(0).toUpperCase() + partClean.slice(1)
      }
    }
  }
  return name
}

/**
 * Returns JSON-compatible content-type produced by the given endpoint and the
 * given HTTP status code - or null, if no JSON-compatible content-type exists.
 *
 * @param  {object} endpoint   OAS endpoint
 * @param  {string} statusCode An HTTP status code
 * @return {string|null}       JSON-producing content type
 */
const getResContentType = (endpoint, statusCode) => {
  if ('responses' in endpoint &&
    statusCode in endpoint.responses &&
    'content' in endpoint.responses[statusCode]) {
    for (let contentType in endpoint.responses[statusCode].content) {
      if (JSON_CONTENT_TYPES.includes(contentType) &&
        'schema' in endpoint.responses[statusCode].content[contentType]) {
        return contentType
      }
    }
  }
  return null
}

/**
 * Returns JSON-compatible content-type required by the given endpoint - or
 * null, if no JSON-compatible content-type exists.
 *
 * @param  {object} endpoint   OAS endpoint
 * @return {string|null}       JSON-producing content type
 */
const getReqContentType = (endpoint) => {
  if ('requestBody' in endpoint &&
    'content' in endpoint.requestBody) {
    for (let contentType in endpoint.requestBody.content) {
      if (JSON_CONTENT_TYPES.includes(contentType) &&
        'schema' in endpoint.requestBody.content[contentType]) {
        return contentType
      }
    }
  }
  return null
}

/**
 * Returns the request schema (if any) for endpoint at given path and method, a
 * dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 *
 * @param  {string} path
 * @param  {string} method
 * @param  {object} oas
 * @return {object}
 */
const getReqSchemaAndNames = (path, method, oas) => {
  let endpoint = oas.paths[path][method]
  let reqRequired = false
  let reqSchemaNames = {}
  let contentType = getReqContentType(endpoint)

  if (contentType) {
    let reqSchema = endpoint.requestBody.content[contentType].schema
    if (typeof endpoint.requestBody.required === 'boolean') {
      reqRequired = endpoint.requestBody.required
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

/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 *
 * Here is the structure of the output:
 * {
 *   {Object} resSchema        Respone schema
 *   {Object} resSchemaNames { Contains possible raw names for the schema
 *     {String} fromPath       Possible name derived from the path
 *     {String} fromRef        Possible name derived from the reference path (if applicable)
 *     {String} fromSchema     Possible name derived from the title parameter (if applicable)
 *   }
 * }
 *
 * @param  {string} path
 * @param  {string} method
 * @param  {object} oas
 *
 * @return {object}
 */
const getResSchemaAndNames = (path, method, oas) => {
  let endpoint = oas.paths[path][method]
  let resSchemaNames = {}
  let statusCode = getResStatusCode(path, method, oas)
  let contentType = getResContentType(endpoint, statusCode)

  if (contentType) {
    let resSchema = endpoint.responses[statusCode].content[contentType].schema

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
    return {
      resSchema: null,
      resSchemaNames: null
    }
  }
}

/**
 * Returns the success status code for the operation at the given path and
 * method (or null).
 * @param  {String} path
 * @param  {String} method
 * @param  {Object} oas    OpenAPI Specification 3.0.x
 * @return {String|null}
 */
const getResStatusCode = (path, method, oas) => {
  let endpoint = oas.paths[path][method]

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
 *
 * @param  {String} path
 * @param  {String} method
 * @param  {Object} oas
 * @return {Hash}          Hash containing links of given endpoint
 */
const getEndpointLinks = (path, method, oas) => {
  let links = {}
  let endpoint = oas.paths[path][method]
  let statusCode = getResStatusCode(path, method, oas)
  if ('links' in endpoint.responses[statusCode]) {
    for (let linkKey in endpoint.responses[statusCode].links) {
      let link = endpoint.responses[statusCode].links[linkKey]
      if ('$ref' in link) {
        link = resolveRef(link['$ref'], oas)
      }
      links[linkKey] = link
    }
  }
  return links
}

/**
 * Returns the list of parameters for the endpoint at the given method and path.
 * Resolves referenced parameters if needed.
 *
 * @param  {string} path
 * @param  {string} method
 * @param  {object} oas
 * @return {array}         List of parameters
 */
const getParameters = (path, method, oas) => {
  let parameters = []

  if (!isOperation(method)) {
    log(`Warning: attempted to get parameters for ${method} ${path}, ` +
      `which is not an opeartion.`)
    return parameters
  }

  // first, consider parameters in Path Item Object:
  if (Array.isArray(oas.paths[path].parameters)) {
    let pathItemParameters = oas.paths[path].parameters.map(p => {
      if ('$ref' in p) {
        return resolveRef(p['$ref'], oas)
      } else {
        return p
      }
    })
    parameters = parameters.concat(pathItemParameters)
  }

  // second, consider parameters in Operation Object:
  let endpoint = oas.paths[path][method]
  if ('parameters' in endpoint) {
    let opParameters = endpoint.parameters.map(p => {
      if ('$ref' in p) {
        return resolveRef(p['$ref'], oas)
      } else {
        return p
      }
    })
    parameters = parameters.concat(opParameters)
  }

  return parameters
}

/**
 * Returns the list of security protocols for the endpoint at the given method and path.
 * Resolves referenced parameters if needed.
 *
 * @param  {string} path
 * @param  {string} method
 * @param  {object} oas
 * @param  {object} mapping
 * @return {object}         Object containing security protocols of given
 *                          endpoint, method, and path
 */
const getSecurityProtocols = (path, method, oas) => {
  let protocols = []
  if (typeof oas.security === 'object' && Object.keys(oas.security).length > 0) {
    for (let protocolIndex in oas.security) {
      for (let protocolKey in oas.security[protocolIndex]) {
        // TODO: enhance checking
        if (typeof oas.security[protocolIndex][protocolKey] === 'object' &&
      oas.components.securitySchemes[protocolKey].type !== 'oauth2') {
          let tempHash = {}
          tempHash[beautify(protocolKey)] = oas.security[protocolIndex][protocolKey]
          protocols.push(tempHash)
        }
      }
    }
  }

  // adding local security protocols
  let endpoint = oas.paths[path][method]
  if (typeof endpoint.security === 'object' && Object.keys(endpoint.security).length > 0) {
    for (let protocolAIndex in endpoint.security) {
      for (let protocolAKey in endpoint.security[protocolAIndex]) {
        if (typeof endpoint.security[protocolAIndex][protocolAKey] === 'object' &&
      oas.components.securitySchemes[protocolAKey].type !== 'oauth2') {
          inner: {
            for (let protocolBKey in protocols) {
              if (deepEqual(endpoint.security[protocolAIndex][protocolAKey], protocols[protocolBKey])) {
                break inner
              }
            }
            let tempHash = {}
            tempHash[beautify(protocolAKey)] = endpoint.security[protocolAIndex][protocolAKey]
            protocols.push(tempHash)
          }
        }
      }
    }
  }
  return protocols
}

/**
 * Beautifies the given string and stores the sanitized-to-original mapping in
 * the given mapping.
 *
 * @param  {string} str
 * @param  {object} mapping
 * @return {string}           Beautified string or an array
 */
const beautifyAndStore = (str, mapping, options) => {
  if (!(typeof mapping === 'object')) {
    throw new Error(`No/invalid mapping passed to beautifyAndStore.`)
  }
  let clean = beautify(str)
  if (clean !== str) {
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
 *
 * @param  {string} str
 * @param  {string} charToRemove
 * @return {string}
 */
const beautify = (str) => {
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
 *
 * GraphQL's validation Regex is: /^[_a-zA-Z][_a-zA-Z0-9]*$/
 *
 * @param  {string} str
 * @return {string}     Sanitized string
 */
const sanitize = (str) => {
  let clean = str.replace(/[^_a-zA-Z0-9]/g, '_')
  return clean
}

/**
 * Stringifies and possibly trims the given string to the provided length.
 *
 * @param  {any} str       If not a string, we stringify it
 * @param  {Number} length Desired length of returned string
 * @return {String}        Trimmed string
 */
const trim = (str, length) => {
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
 *
 * @param  {String} method
 * @return {Boolean}       True, if given method is an operation.
 */
const isOperation = (method) => {
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
  mutationMethods,
  getEndpointLinks,
  getParameters,
  getSecurityProtocols,
  sanitizeObjKeys,
  desanitizeObjKeys,
  beautify,
  beautifyAndStore,
  trim,
  isOperation
}
