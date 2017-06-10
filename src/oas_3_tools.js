'use strict'

const querystring = require('querystring')
const mutationMethods = ['post', 'put', 'patch', 'delete']

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
  return oas.servers[0].url
}

/**
 * Replaces the path parameter in the given path with values in the given args.
 *
 * @param  {string} path
 * @param  {object} endpoint
 * @param  {object} args     Arguments
 * @return {string}          Path with parameters replaced by argument values
 */
const instantiatePath = (path, endpoint, args) => {
  // case: nothing to do
  if (!Array.isArray(endpoint.parameters)) {
    return path
  }

  let query = {}
  // iterate parameters:
  for (let i in endpoint.parameters) {
    let param = endpoint.parameters[i]

    // path parameters:
    if (param.in === 'path') {
      path = path.replace(`{${param.name}}`, args[param.name])
    }

    // query parameters:
    if (param.in === 'query' &&
      param.name in args) {
      query[param.name] = args[param.name]
    }
    path += querystring.stringify(query)

    // TODO: body...
  }
  return path
}

/**
 * Returns the "type" of the given JSON schema. Makes best guesses if the type
 * is not explicitly defined.
 *
 * @param  {object} schema JSON-schema
 * @return {string}        Type of the JSON-schema
 */
const getSchemaType = (schema) => {
  if (typeof schema.type === 'string') {
    return schema.type
  }
  if ('properties' in schema) {
    return 'object'
  }
  if ('items' in schema) {
    return 'array'
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
 * Checks whether the given endpoint has a response JSON schema.
 *
 * @param  {object} endpoint OAS endpoint
 * @return {boolean}         True, if endpoint has response payload schema
 */
const endpointReturnsJson = (endpoint) => {
  return 'responses' in endpoint &&
    '200' in endpoint.responses &&
    'content' in endpoint.responses['200'] &&
    'application/json' in endpoint.responses['200'].content &&
    'schema' in endpoint.responses['200'].content['application/json']
}

const endpointReturnsJsonForStatus = (endpoint, statusCode) => {
  return 'responses' in endpoint &&
    statusCode in endpoint.responses &&
    'content' in endpoint.responses[statusCode] &&
    'application/json' in endpoint.responses[statusCode].content &&
    'schema' in endpoint.responses[statusCode].content['application/json']
}

/**
 * Checks whether the given endpoint has a request payload JSON schema.
 *
 * @param  {object} endpoint OAS endpoint
 * @return {boolean}         True, if endpoint has request payload schema
 */
const endpointHasReqSchema = (endpoint) => {
  return 'requestBody' in endpoint &&
    'content' in endpoint.requestBody &&
    'application/json' in endpoint.requestBody.content &&
    'schema' in endpoint.requestBody.content['application/json']
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

  if (endpointHasReqSchema(endpoint)) {
    let reqSchema = endpoint.requestBody.content['application/json'].schema
    if (typeof endpoint.requestBody.required === 'boolean') {
      reqSchemaRequired = endpoint.requestBody.required
    }
    reqSchemaNames.fromPath = beautify(sanitize(inferResourceNameFromPath(path)), '_')

    if ('$ref' in reqSchema) {
      reqSchemaNames.fromRef = beautify(sanitize(reqSchema['$ref'].split('/').pop()), '_')
      reqSchema = resolveRef(reqSchema['$ref'], oas)
    }
    if ('title' in reqSchema) {
      reqSchemaNames.fromSchema = beautify(sanitize(reqSchema.title), '_')
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

  if (endpointReturnsJsonForStatus(endpoint, statusCode)) {
    let resSchema = endpoint.responses[statusCode].content['application/json'].schema

    resSchemaNames.fromPath = beautify(sanitize(inferResourceNameFromPath(path)), '_')

    if ('$ref' in resSchema) {
      resSchemaNames.fromRef = beautify(sanitize(resSchema['$ref'].split('/').pop()), '_')
      resSchema = resolveRef(resSchema['$ref'], oas)
    }
    if ('title' in resSchema) {
      resSchemaNames.fromSchema = beautify(sanitize(resSchema.title), '_')
    }

    return {
      resSchema,
      resSchemaNames
    }
  }
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
  let endpoint = oas.paths[path][method]

  if ('parameters' in endpoint) {
    parameters = endpoint.parameters.map(p => {
      if ('$ref' in p) {
        return resolveRef(p['$ref'], oas)
      } else {
        return p
      }
    })
  }

  return parameters
}

/**
 * Removes charToRemove from given string, and capitalizes following characters.
 *
 * @param  {string} str
 * @param  {string} charToRemove
 * @return {string}
 */
const beautify = (str, charToRemove) => {
  while (str.indexOf(charToRemove) !== -1) {
    let pos = str.indexOf(charToRemove)
    if (str.length >= pos + 2) {
      str = str.slice(0, pos) + str.charAt(pos + 1).toUpperCase() + str.slice(pos + 2, str.length)
    } else if (str.length === pos + 1) {
      str = str.slice(0, pos) + str.charAt(pos + 1).toUpperCase()
    } else {
      str = str.slice(0, pos)
    }
  }
  return str
}

/**
 * Sanitizes the given string so that it can be used as the name for a GraphQL
 * Object Type.
 *
 * @param  {string} str
 * @return {string}     Sanitized string
 */
const sanitize = (str) => {
  return str.replace(/[^a-zA-Z0-9]/g, '_')
}

module.exports = {
  resolveRef,
  getBaseUrl,
  instantiatePath,
  getSchemaType,
  inferResourceNameFromPath,
  getEndpointLinks,
  endpointReturnsJson,
  getReqSchemaAndNames,
  getResSchemaAndNames,
  mutationMethods,
  getParameters,
  sanitize
}
