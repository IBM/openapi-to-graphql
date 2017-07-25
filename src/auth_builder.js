const {
  GraphQLString,
  GraphQLObjectType,
  GraphQLNonNull
} = require('graphql')
const SchemaBuilder = require('./schema_builder.js')
const Oas3Tools = require('./oas_3_tools.js')
const log = require('debug')('translation')

/**
 * Checks if security is required in any operation
 *
 * @param  {object} oas
 * @return {boolean}
 */
const hasAuth = (oas) => {
  if ('security' in oas && oas.security.length > 0) {
    return true
  } else {
    for (let path in oas.paths) {
      for (let method in oas.paths[path]) {
        if ('security' in oas.paths[path][method] && oas.paths[path][method].security.length > 0) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * For a given operation, retrieve all the sercurity protocols that operation uses
 *
 * @param  {string} operationId
 * @param  {object} oas
 * @return {object}
 */
const getSecurityProtocols = (operationId, oas) => {
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (oas.paths[path][method].operationId === operationId) {
        return oas.paths[path][method].security
      }
    }
  }
  return null
}

/**
 * Creates a viewer object
 *
 * @param  {object} data
 * @param  {object} charToRemove
 * @param  {string} name
 * @param  {string} protocolName      Optional. Used to identify specific arguments rather than return all possible arguments
 * @return {object}               A new GraphQL Object Type
 */
const getViewerOT = (data, viewerQueryFields, name, protocolName) => {
  let protocol = data.security[protocolName]

  let resolve = (root, args, ctx) => {
    let security = {}
    if (typeof protocolName === 'string') {
      security[protocolName] = args
    } else {
      security.anyAuth = args
    }

    // viewers are always root, so we can instantiate _oasgraph here without
    // previously checking for its existence
    return {
      _oasgraph: {
        security
      }
    }
  }

  let args = {}
  if (typeof protocol === 'object') {
    for (let parameterName in protocol.parameters) {
      args[parameterName] = {type: new GraphQLNonNull(GraphQLString)}
    }
  } else {
    for (let protocolName in data.security) {
      for (let parameterName in data.security[protocolName].parameters) {
        args[protocol.parameters[parameterName]] = {type: GraphQLString}
      }
    }
  }

  return {
    viewerOT: new GraphQLObjectType({
      name: name,
      description: `A viewer for the security protocol: "${protocol.rawName}"`,
      fields: viewerQueryFields
    }),
    resolve,
    args
  }
}

/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 *
 * @param  {object} oas       OpenAPI Specification 3.0
 * @param  {object} data      Data produced by preprocessing
 * @param  {object} objectNames Contains the names that will be used to generate
 * the viewer object types
 *
 * An example:
 *  objectNames: {
 *    objectPreface: 'viewer',  // Appended in front of the security type to
 *                                 generate the viewer object name
 *    anyAuthName: 'queryViewerAnyAuth' // Used as the name of the AnyAuth
 *                                         object type
 *  }
 *
 * @param  {object} usedObjectNames Object that contains all previously defined
 * viewer object names
 * @param  {object} queryFields Object that contains the fields for either
 * viewer or mutationViewer object types
 * @param  {object} rootFields Object that contains all object types of either
 * query or mutation object
 */
const createAndLoadViewer = (
    oas,
    data,
    objectNames,
    usedObjectNames,
    queryFields,
    rootFields
) => {
  let allFields = {}
  for (let protocolName in queryFields) {
    Object.assign(allFields, queryFields[protocolName])

    // Check if the name has already been
    // If so, create a new name and add it to the list, if not add it to the list too
    let typeName = data.security[protocolName].def.type
    if (typeName === 'http') {
      switch (data.security[protocolName].def.scheme) {
        case 'basic':
          typeName = 'BasicAuth'
          break

        default:
          if (data.options.strict) {
            throw new Error(`Unsupported scheme ${data.security[protocolName].def.scheme} for HTTP authentication`)
          }
          log(`Unsupported scheme ${data.security[protocolName].def.scheme} for HTTP authentication`)
      }
    }
    let objectName = Oas3Tools.beautify(objectNames.objectPreface + typeName)
    if (!(typeName in usedObjectNames)) {
      usedObjectNames[typeName] = []
    }
    if (usedObjectNames[typeName].indexOf(objectName) !== -1) {
      objectName += (usedObjectNames[typeName].length + 1)
      usedObjectNames[typeName].push(objectName)
    }
    usedObjectNames[typeName].push(objectName)

    // Create the specialized viewer object types
    let {viewerOT, args, resolve} = getViewerOT(data,
      queryFields[protocolName], objectName, protocolName)

    // Add the viewer object type to the specified root query object type
    rootFields[objectName] = {
      type: viewerOT,
      resolve,
      args,
      description: `A viewer that wraps all operations authenticated via ` +
        `${typeName}`
    }
  }

  // Create the AnyAuth viewer object type
  let {viewerOT, args, resolve} = getViewerAnyAuthOT(data, allFields, oas, objectNames.anyAuthName)

  // Add the AnyAuth object type to the specified root query object type
  rootFields[objectNames.anyAuthName] = {
    type: viewerOT,
    resolve,
    args,
    description: `A viewer that wraps operations for all available ` +
      `authentication mechanisms`
  }
}

const getViewerAnyAuthOT = (data, viewerQueryFields, oas, name) => {
  let args = {}

  for (let protocolName in data.security) {
    if (data.security[protocolName].def.type !== 'oauth2') {
      args[protocolName] = { type: SchemaBuilder.getGraphQLType({
        name: protocolName,
        schema: data.security[protocolName].schema,
        data,
        oas,
        isMutation: true
      })}
    }
  }

  let resolve = (root, args, ctx) => {
    return {
      _oasgraph: {
        security: args
      }
    }
  }

  return {
    viewerOT: new GraphQLObjectType({
      name: name,
      description: 'Warning: Not every request will work with this Viewer object type',
      fields: viewerQueryFields
    }),
    resolve,
    args
  }
}

module.exports = {
  hasAuth,
  getSecurityProtocols,
  getViewerOT,
  createAndLoadViewer,
  getViewerAnyAuthOT
}
