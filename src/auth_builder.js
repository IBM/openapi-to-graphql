const {
  GraphQLString,
  GraphQLObjectType
} = require('graphql')

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

const getViewerOT = (data, viewerQueryFields, name) => {
  let resolve = (root, args, ctx) => {
    ctx['security'] = args
    return {}
  }
  let args = {}

  for (let protocol in data.security) {
    for (let parameter in data.security[protocol].parameters) {
      args[data.security[protocol].parameters[parameter]] = {type: GraphQLString}
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
