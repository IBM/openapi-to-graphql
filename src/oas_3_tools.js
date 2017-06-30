'use strict'

const mutationMethods = ['post', 'put', 'patch', 'delete']
const deepEqual = require('deep-equal')
const Swagger2OpenAPI = require('swagger2openapi')
const OASValidator = require('swagger2openapi/validate.js')

const logPre = require('debug')('preprocessing')
const log = require('debug')('translation')

/**
 * OAS constants
 */
const OAS_OPERATIONS = ['get', 'put', 'post', 'delete', 'options', 'head', 'path', 'trace']
const JSON_CONTENT_TYPES = ['application/json', '*/*']

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
 * Returns the base URL from the given OAS.
 *
 * @param  {object} oas
 * @return {string}     Base URL
 */
const getBaseUrl = (oas) => {
  // TODO: fix this...
  let url = oas.servers[0].url
  return url.replace(/\/$/, '')
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
    if (Array.isArray(obj)) {
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
 * Returns JSON-compatible content-type required by the given endpoint and given
 * HTTP status code - or null, if no JSON-compatible content-type exists.
 *
 * @param  {object} endpoint   OAS endpoint
 * @param  {string} statusCode An HTTP status code
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
  let reqSchemaRequired = false
  let reqSchemaNames = {}
  let contentType = getReqContentType(endpoint)

  if (contentType) {
    let reqSchema = endpoint.requestBody.content[contentType].schema
    if (typeof endpoint.requestBody.required === 'boolean') {
      reqSchemaRequired = endpoint.requestBody.required
    }
    reqSchemaNames.fromPath = beautify(inferResourceNameFromPath(path))

    if ('$ref' in reqSchema) {
      reqSchemaNames.fromRef = beautify(reqSchema['$ref'].split('/').pop())
      reqSchema = resolveRef(reqSchema['$ref'], oas)
    }
    if ('title' in reqSchema) {
      reqSchemaNames.fromSchema = beautify(reqSchema.title)
    }

    return {
      reqSchema,
      reqSchemaNames,
      reqSchemaRequired
    }
  }
  return {}
}

/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 *
 * @param  {string} path
 * @param  {string} method
 * @param  {string} statusCode
 * @param  {object} oas
 * @return {object}
 */
const getResSchemaAndNames = (path, method, statusCode, oas) => {
  let endpoint = oas.paths[path][method]
  let resSchemaNames = {}
  let contentType = getResContentType(endpoint, statusCode)

  if (contentType) {
    let resSchema = endpoint.responses[statusCode].content[contentType].schema

    resSchemaNames.fromPath = beautify(inferResourceNameFromPath(path))

    if ('$ref' in resSchema) {
      resSchemaNames.fromRef = beautify(resSchema['$ref'].split('/').pop())
      resSchema = resolveRef(resSchema['$ref'], oas)
    }
    if ('title' in resSchema) {
      resSchemaNames.fromSchema = beautify(resSchema.title)
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
 * Returns an object containing the links defined in the given endpoint.
 *
 * @param  {string} path
 * @param  {string} method
 * @param  {object} oas
 * @return {object}          Object containing links of given endpoint
 */
const getEndpointLinks = (path, method, oas) => {
  let links = {}
  let endpoint = oas.paths[path][method]
  if ('links' in endpoint.responses['200']) {
    for (let linkKey in endpoint.responses['200'].links) {
      let link = endpoint.responses['200'].links[linkKey]
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
      for (let protocol in oas.security[protocolIndex]) {
        // TODO: enhance checking
        if (typeof oas.security[protocol] === 'object') {
          let tempHash = {}
          tempHash[beautify(protocol)] = oas.security[protocol]
          protocols.push(tempHash)
        }
      }
    }
  }

  // adding local security protocols
  let endpoint = oas.paths[path][method]
  if (typeof endpoint.security === 'object' && Object.keys(endpoint.security).length > 0) {
    for (let protocolAIndex in endpoint.security) {
      for (let protocolA in endpoint.security[protocolAIndex]) {
        if (typeof endpoint.security[protocolAIndex][protocolA] === 'object') {
          (function () {
            for (let protocolB in protocols) {
              if (deepEqual(endpoint.security[protocolAIndex][protocolA], protocols[protocolB])) {
                return
              }
            }
            let tempHash = {}
            tempHash[beautify(protocolA)] = endpoint.security[protocolAIndex][protocolA]
            protocols.push(tempHash)
          })()
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
 * TODO:   beautifyAndStore() maps the beautified to the original while
 *         beautifyAndStoreArray() maps the original to the beautified array
 */

/**
 * Beautifies the array of strings and stores the string-to-sanitized array
 * mapping in the given mapping.
 *
 * @param  {string} str
 * @param  {object} array
 * @param  {object} mapping
 * @return {object}           Beautified array
 */
const beautifyAndStoreArray = (str, array, mapping) => {
  if (!(typeof mapping === 'object')) {
    throw new Error(`No/invalid mapping passed to beautifyAndStore.`)
  }
  if (array.isArray()) {
    let tempArray = []
    for (let element in array) {
      if (typeof element === 'string') {
        tempArray.push(beautify(element))
      } else {
        let warning = `Warning: Cannot beautify "${element}" in array field.` +
          `Options should be an array of Strings.`
        console.warn(warning)
      }
    }
    if (str in mapping && tempArray !== mapping[str]) {
      console.warn(`Warning: "${tempArray}" and "${mapping[str]}" both` +
        `sanitize to ${str} - collusion possible. Desanitize to
        ${tempArray}.`)
    }
    mapping[str] = tempArray
    return tempArray
  } else {
    let error = new Error('options parameter is not an array')
    console.error(error)
    throw error
  }
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
  beautifyAndStoreArray,
  trim,
  isOperation
}
