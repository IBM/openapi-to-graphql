const {
  GraphQLString,
  GraphQLObjectType,
  GraphQLNonNull
} = require('graphql')

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
 * @param  {object} protocol      Optional. Used to identify specific arguments rather than return all possible arguments
 * @return {object}               A new GraphQL Object Type
 */
const getViewerOT = (data, viewerQueryFields, name, protocol) => {
  let resolve = (root, args, ctx) => {
    ctx['security'] = args
    return {}
  }
  let args = {}

  if (typeof protocol === 'object') {
    for (let parameter in protocol.parameters) {
      args[parameter] = {type: new GraphQLNonNull(GraphQLString)}
    }
  } else {
    for (let protocol in data.security) {
      for (let parameter in data.security[protocol].parameters) {
        args[data.security[protocol].parameters[parameter]] = {type: GraphQLString}
      }
    }
  }

  return {
    viewerOT: new GraphQLObjectType({
      name: name,
      fields: viewerQueryFields
    }),
    resolve,
    args
  }
}

module.exports = {
  hasAuth,
  getSecurityProtocols,
  getViewerOT
}
