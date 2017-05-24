'use strict'

const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull
} = require('graphql')
const Oas3Tools = require('./oas_3_tools.js')
const ResolverBuilder = require('./resolver_builder.js')

/**
 * Creates and returns a GraphQL type definition for the given JSON schema.
 * "GraphQL Objects represent a list of named fields, each of which also yields
 * a value of their own type."
 *
 * Nested example: https://gist.github.com/xpepermint/7376b8c67caa926e19d2
 *
 * A returned GraphQLObjectType has the following internal structure:
 *
 * new GraphQLObjectType({
 *   'name'        // optional name of the type
 *   'description' // optional description of type
 *   'fields'      // REQUIRED thunk returning fields
 *     'type'      // REQUIRED definition of the field type
 *     'args'      // optional definition of types
 *     'resolve'   // optional function defining how to obtain this type
 * })
 *
 * @param  {[type]} name   [description]
 * @param  {[type]} schema [description]
 * @return {[type]}        [description]
 */
const getTypeDef = (name, schema, links, oas, allOTs, iteration) => {
  if (typeof iteration === 'undefined') {
    iteration = 0
  }

  // some error checking:
  if (typeof schema !== 'object') {
    throw new Error(`invalid schema provided of type ${typeof schema}`)
  }
  if (typeof schema.type !== 'string') {
    throw new Error(`schema has no/wrong type ${schema.type}`)
  }

  // case: object - create ObjectType:
  if (schema.type === 'object') {
    return new GraphQLObjectType({
      name: name,
      description: schema.description, // might be undefined
      fields: () => {
        return createFields(schema, links, oas, allOTs, iteration)
      }
    })
  // case: array - create ArrayType:
  } else if (schema.type === 'array') {
    // TODO: implement!!!
  // case: scalar:
  } else {
    return {
      type: getScalarType(schema.type)
    }
  }
}

/**
 * Creates the fields object to be used by an ObjectType.
 *
 * @param  {[type]} schema    [description]
 * @param  {[type]} links     [description]
 * @param  {[type]} oas       [description]
 * @param  {[type]} allOTs    [description]
 * @param  {[type]} iteration [description]
 * @return {[type]}           [description]
 */
const createFields = (schema, links, oas, allOTs, iteration) => {
  let fields = {}

  // create fields for all properties:
  for (let propKey in schema.properties) {
    let prop = schema.properties[propKey]

    let nextIteration = iteration + 1
    let otToAdd = getTypeDef(propKey, prop, links, oas, allOTs, nextIteration)
    if (typeof otToAdd.getFields === 'function') {
      fields[propKey] = {
        type: otToAdd
      }
    } else {
      fields[propKey] = otToAdd
    }
  }

  // create fields for (potential) links:
  for (let linkKey in links) {
    if (iteration === 0) {
      let operationId = links[linkKey].operationId
      let parameters = links[linkKey].parameters

      // create args function:
      // 1. determine parameters provided via link:
      let op = Oas3Tools.getOperationById(operationId, oas)
      let argsFromLink = {}
      for (let linkArg in parameters) {
        argsFromLink[linkArg] = parameters[linkArg].split('body#/')[1]
      }

      // 2. remove argsFromLinks from operation parameters:
      let dynamicParams = op.endpoint.parameters.filter(p => {
        return !(p.name in argsFromLink)
      })

      let linkArgs = getArgs(dynamicParams)

      // create resolve function:
      let linkResolve = ResolverBuilder.getResolver(
        op.path,
        op.method,
        op.endpoint,
        oas,
        argsFromLink
      )

      fields[linkKey] = {
        type: allOTs[operationId],
        resolve: linkResolve,
        args: linkArgs
      }
    }
  }
  return fields
}

const getArgs = (params) => {
  let args = {}
  for (let i in params) {
    let param = params[i]
    let type = GraphQLString
    if ('schema' in param &&
      'type' in param.schema &&
      !(param.schema.type === 'object' || param.schema.type === 'array')) {
      type = getScalarType(param.schema.type)
    }
    args[param.name] = {
      type: param.required ? new GraphQLNonNull(type) : type
    }
  }
  return args
}

/**
 * Returns the scalar GraphQL type matching the given JSON schema type.
 *
 * @param  {string} type Atomic JSON schema type
 * @return {string}      Atomic GraphQL type
 */
const getScalarType = (type) => {
  switch (type) {
    case 'string':
      return GraphQLString
    case 'integer':
      return GraphQLInt
    case 'number':
      return GraphQLFloat
    case 'boolean':
      return GraphQLBoolean
    default:
      return null
  }
}

module.exports = {
  getTypeDef: getTypeDef,
  getArgs: getArgs
}
