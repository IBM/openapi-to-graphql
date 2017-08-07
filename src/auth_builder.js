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
 * @param  {Object}  oas Raw OpenAPI Specification 3.0
 *
 * @return {Boolean}
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
 * @param  {String} operationId Operation ID of the operation in question
 * @param  {Object} oas         Raw OpenAPI Specification 3.0
 *
 * @return {Object}
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
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 *
 * @param  {Object}  queryFields     Object that contains the fields for either
 *                                     viewer or mutationViewer object types
 * @param  {Object}  rootFields      Object that contains all object types of either
 *                                     query or mutation object
 * @param  {Object}  usedObjectNames Object that contains all previously defined
 *                                     viewer object names
 * @param  {Object}  data            Data produced by preprocessing
 * @param  {Object}  oas             Raw OpenAPI Specification 3.0
 * @param  {Boolean} isMutation      Whether to create a viewer or a mutationViewer
 */
const createAndLoadViewer = (
    queryFields,
    rootFields,
    usedObjectNames,
    data,
    oas,
    isMutation = false
) => {
  let allFields = {}
  for (let protocolName in queryFields) {
    Object.assign(allFields, queryFields[protocolName])

    /**
     * check if the name has already been used (i.e. in the list)
     * if so, create a new name and add it to the list
     */
    let type = data.security[protocolName].def.type

    /**
     * HTTP is not an authentication protocol
     * HTTP covers a number of different authentication type
     * change the typeName to match the exact authentication type (e.g. basic authentication)
     */
    if (type === 'http') {
      switch (data.security[protocolName].def.scheme) {
        case 'basic':
          type = 'BasicAuth'
          break

        default:
          if (data.options.strict) {
            throw new Error(`Unsupported scheme ${data.security[protocolName].def.scheme} for HTTP authentication`)
          }
          log(`Unsupported scheme ${data.security[protocolName].def.scheme} for HTTP authentication`)
      }
    }

    // create name for the viewer
    let objectName

    if (!isMutation) {
      objectName = Oas3Tools.beautify(`viewer ${type}`)
    } else {
      objectName = Oas3Tools.beautify(`mutation viewer ${type}`)
    }

    if (!(type in usedObjectNames)) {
      usedObjectNames[type] = []
    }
    if (usedObjectNames[type].indexOf(objectName) !== -1) {
      objectName += (usedObjectNames[type].length + 1)
      usedObjectNames[type].push(objectName)
    }
    usedObjectNames[type].push(objectName)
    // Create the specialized viewer object types
    let {viewerOT, args, resolve} = getViewerOT(objectName, protocolName, queryFields[protocolName], data)

    // Add the viewer object type to the specified root query object type
    rootFields[objectName] = {
      type: viewerOT,
      resolve,
      args,
      description: `A viewer that wraps all operations authenticated via ${type}`
    }
  }

  // create name for the AnyAuth viewer
  let AnyAuthObjectName

  if (!isMutation) {
    AnyAuthObjectName = 'viewerAnyAuth'
  } else {
    AnyAuthObjectName = 'mutationViewerAnyAuth'
  }

  // Create the AnyAuth viewer object type
  let {viewerOT, args, resolve} = getViewerAnyAuthOT(AnyAuthObjectName, allFields, data, oas)

  // Add the AnyAuth object type to the specified root query object type
  rootFields[AnyAuthObjectName] = {
    type: viewerOT,
    resolve,
    args,
    description: `A viewer that wraps operations for all available ` +
      `authentication mechanisms`
  }
}

/**
 * Gets the viewer Object, resolve function, and arguments
 *
 * @param  {String} name
 * @param  {String} protocolName Optional. Used to identify specific arguments rather than return all possible arguments
 * @param  {Object} queryFields  Object that contains the fields for object types
 *                                 that require the specified authentication protocol
 * @param  {Object} data
 *
 * @return {Object}              Contains viewer GraphQL Object Type, resolver, and arguments
 */
const getViewerOT = (name, protocolName, queryFields, data) => {
  let protocol = data.security[protocolName]

  let resolve = (root, args, ctx) => {
    let security = {}
    if (typeof protocolName === 'string') {
      security[protocolName] = args
    } else {
      security.anyAuth = args
    }

    /**
     * viewers are always root, so we can instantiate _oasgraph here without
     * previously checking for its existence
     */
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
      fields: queryFields
    }),
    resolve,
    args
  }
}

/**
 * Create an object containing an AnyAuth viewer, its resolve function, and its args
 *
 * @param  {String}  name              Name of the AnyAuth object
 * @param  {Object}  queryFields       Object that contains the fields for all
 *                                       authenticated object types
 * @param  {Object}  data              Data produced by preprocessing
 * @param  {Object}  oas               Raw OpenAPI Specification 3.0
 *
 * @return {Object}                    Contains AnyAuth viewer, resolver, and args
 */
const getViewerAnyAuthOT = (name, queryFields, data, oas) => {
  let args = {}
  for (let protocolName in data.security) {
    // create input object types for the viewer arguments
    // NOTE: does not need to check for OAuth 2.0 anymore
    args[protocolName] = { type: SchemaBuilder.getGraphQLType({
      name: protocolName,
      schema: data.security[protocolName].schema,
      data,
      oas,
      isMutation: true
    })}
  }

  // pass object containing security information to fields
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
      fields: queryFields
    }),
    resolve,
    args
  }
}

module.exports = {
  hasAuth,
  getSecurityProtocols,
  createAndLoadViewer
}
