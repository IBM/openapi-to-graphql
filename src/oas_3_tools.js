'use strict'

const querystring = require('querystring')

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

module.exports = {
  resolveRef: resolveRef,
  getBaseUrl: getBaseUrl,
  instantiatePath: instantiatePath,
  getSchemaForOpId: getSchemaForOpId,
  getOperationById: getOperationById
}
