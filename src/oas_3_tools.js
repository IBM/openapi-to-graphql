'use strict'

const querystring = require('querystring')
const mutationMethods = ['post', 'put', 'patch', 'delete']

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

const getBaseUrl = (oas) => {
  // TODO: fix this...
  return oas.servers[0].url
}

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

const getOperationById = (operationId, oas) => {
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      let endpoint = oas.paths[path][method]
      if (endpoint.operationId === operationId) {
        return {
          method: method,
          path: path,
          endpoint: endpoint
        }
      }
    }
  }
}

const getSchemaForOpId = (opId, oas) => {
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      let endpoint = oas.paths[path][method]
      if (endpoint.operationId === opId &&
        'responses' in endpoint &&
        '200' in endpoint.responses &&
        'content' in endpoint.responses['200'] &&
        'application/json' in endpoint.responses['200'].content &&
        'schema' in endpoint.responses['200'].content['application/json']) {
        // determine schema and name:
        let schema = endpoint.responses['200'].content['application/json'].schema
        if ('$ref' in schema) {
          schema = resolveRef(schema['$ref'], oas)
        }
        return schema
      }
    }
  }
  return null
}

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

const getEndpointLinks = (endpoint, oas) => {
  let links = {}
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

const endpointReturnsJson = (endpoint) => {
  return 'responses' in endpoint &&
    '200' in endpoint.responses &&
    'content' in endpoint.responses['200'] &&
    'application/json' in endpoint.responses['200'].content &&
    'schema' in endpoint.responses['200'].content['application/json']
}

const endpointHasReqSchema = (endpoint) => {
  return 'requestBody' in endpoint &&
    'content' in endpoint.requestBody &&
    'application/json' in endpoint.requestBody.content &&
    'schema' in endpoint.requestBody.content['application/json']
}

/**
 * Returns the (resolved) response schema and schemaName for the endpoint at the
 * given path and method.
 *
 * @param  {string} path
 * @param  {string} method
 * @param  {object} oas
 * @return {object}        Contains schema and name of schema
 */
const getResSchemaAndName = (path, method, oas) => {
  let endpoint = oas.paths[path][method]

  if (endpointReturnsJson(endpoint)) {
    let schema = endpoint.responses['200'].content['application/json'].schema
    let schemaName = inferResourceNameFromPath(path)

    if ('$ref' in schema) {
      schemaName = schema['$ref'].split('/').pop()
      schema = resolveRef(schema['$ref'], oas)
    }
    if ('title' in schema) {
      schemaName = schema.title
    }

    // mutating operations have a special name, starting with the method.
    // For example: postSchemaName, putSchemaName etc.
    if (mutationMethods.includes(method.toLowerCase())) {
      schemaName = method.toLowerCase() +
      schemaName.charAt(0).toUpperCase() +
      schemaName.slice(1)
    }

    // strip possibly remaining unnoted characters:
    schemaName = sanitize(schemaName)

    return {
      schema,
      schemaName
    }
  }
  return {}
}

const getReqSchemaAndName = (path, method, oas) => {
  let endpoint = oas.paths[path][method]

  if (endpointHasReqSchema(endpoint)) {
    let reqSchema = endpoint.requestBody.content['application/json'].schema
    let reqSchemaName = inferResourceNameFromPath(path)

    if ('$ref' in reqSchema) {
      reqSchemaName = reqSchema['$ref'].split('/').pop()
      reqSchema = resolveRef(reqSchema['$ref'], oas)
    }
    if ('title' in reqSchema) {
      reqSchemaName = reqSchema.title
    }

    // mutating operations have a special name, starting with the method.
    // For example: postSchemaName, putSchemaName etc.
    if (mutationMethods.includes(method.toLowerCase())) {
      reqSchemaName = method.toLowerCase() +
      reqSchemaName.charAt(0).toUpperCase() +
      reqSchemaName.slice(1)
    }

    // strip possibly remaining unnoted characters:
    reqSchemaName = sanitize(reqSchemaName)

    return {
      reqSchema,
      reqSchemaName
    }
  }
  return {}
}

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

const sanitize = (str) => {
  return str.replace(/[^a-zA-Z0-9]/g, '_')
}

module.exports = {
  resolveRef,
  getBaseUrl,
  instantiatePath,
  getSchemaForOpId,
  getOperationById,
  getSchemaType,
  inferResourceNameFromPath,
  getEndpointLinks,
  endpointReturnsJson,
  getResSchemaAndName,
  mutationMethods,
  getReqSchemaAndName,
  getParameters,
  sanitize
}
