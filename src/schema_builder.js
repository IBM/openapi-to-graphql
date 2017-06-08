'use strict'

const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInputObjectType
} = require('graphql')
const Oas3Tools = require('./oas_3_tools.js')
const ResolverBuilder = require('./resolver_builder.js')

/**
 * Creates a GraphQL (input) Object Type definition for the given JSON schema.
 *
 * Nested example: https://gist.github.com/xpepermint/7376b8c67caa926e19d2
 *
 * A returned GraphQLObjectType has the following internal structure:
 *
 *   new GraphQLObjectType({
 *     'name'        // optional name of the type
 *     'description' // optional description of type
 *     'fields'      // REQUIRED thunk returning fields
 *       'type'      // REQUIRED definition of the field type
 *       'args'      // optional definition of types
 *       'resolve'   // optional function defining how to obtain this type
 *   })
 *
 * @param  {string}  options.name   Name of the Type Definition to create
 * @param  {object}  options.schema JSON-schema to get GraphQL Object Def. for
 * @param  {object}  options.links  Object containing the (possible) links
 * between this object to other endpoints (= operations)
 * @param  {object}  oas
 * @param  {object}  allOTs         Contains existing Object Types
 * @param  {object}  allIOTs        Contains existing Input Object Types
 * @param  {Number}  iteration      Integer count of recursions used to create
 * this schema
 * @param  {Boolean} isMutation     Whether to create an Input Object Type
 * @return {Object}                 GraphQLObjectType | GraphQLList |
 * Object with scalar type
 */
const getObjectType = ({
  name,
  schema,
  links = {},
  oas,
  allOTs,
  allIOTs,
  iteration = 0,
  isMutation = false
}) => {
  // avoid excessive iterations:
  if (iteration === 20) {
    throw new Error(`Too many iterations`)
  }

  // some error checking:
  if (typeof schema !== 'object') {
    throw new Error(`invalid schema provided of type ${typeof schema}`)
  }

  // determine the type of the schema:
  let type = Oas3Tools.getSchemaType(schema)
  if (!type) {
    throw new Error(`schema has no/wrong type: ${JSON.stringify(schema)}`)
  }

  // CASE: object - create ObjectType:
  if (type === 'object') {
    if (isMutation) {
      name = name + 'Input'
      if (name in allIOTs) {
        return allIOTs[name]
      } else {
        allIOTs[name] = new GraphQLInputObjectType({
          name: name,
          description: schema.description, // might be undefined
          fields: () => {
            return createFields({
              schema,
              links,
              oas,
              allOTs,
              allIOTs,
              iteration,
              isMutation
            })
          }
        })
        return allIOTs[name]
      }
    } else {
      if (name in allOTs) {
        return allOTs[name]
      } else {
        allOTs[name] = new GraphQLObjectType({
          name: name,
          description: schema.description, // might be undefined
          fields: () => {
            return createFields({
              schema,
              links,
              oas,
              allOTs,
              allIOTs,
              iteration,
              isMutation
            })
          }
        })
        return allOTs[name]
      }
    }

  // case: ARRAY - create ArrayType:
  } else if (type === 'array') {
    // determine name of items:
    let itemsName = 'some_name'

    if (!('items' in schema)) {
      throw new Error(`Items property missing in array schema definition`)
    }

    if ('title' in schema.items) {
      itemsName = schema.items.title
    }

    if ('$ref' in schema.items) {
      itemsName = schema.items['$ref'].split('/').pop()
      schema.items = Oas3Tools.resolveRef(schema.items['$ref'], oas)
    }

    // determine the type of the items in the array:
    let itemsType = Oas3Tools.getSchemaType(schema.items)
    if (!itemsType) {
      throw new Error(`Type property missing in items definition`)
    }

    if (itemsType === 'object' || itemsType === 'array') {
      let nextIt = iteration + 1
      let type
      if (!isMutation && itemsName in allOTs) {
        type = allOTs[itemsName]
      } else if (isMutation && itemsName in allIOTs) {
        type = allIOTs[itemsName]
      } else {
        type = getObjectType({
          name: itemsName,
          schema: schema.items,
          links,
          oas,
          allOTs,
          allIOTs,
          iteration: nextIt,
          isMutation
        })
      }
      return {
        type: new GraphQLList(type),
        description: schema.description // might be undefined
      }
    } else {
      let type = getScalarType(itemsType)
      return {
        type: new GraphQLList(type),
        description: schema.description // might be undefined
      }
    }

  // CASE: scalar
  } else {
    return {
      type: getScalarType(type),
      description: schema.description // might be undefined
    }
  }
}

/**
 * Creates the fields object to be used by an ObjectType.
 *
 * @param  {object} schema    JSON-schema from an OAS schema
 * @param  {object} links     Object containing the (possible) links between
 * this object to other endpoints (= operations)
 * @param  {object} oas       The original OAS
 * @param  {object} allOTs    Object containing operationId as key and derived
 * GraphQLObjectType as value (if existent)
 * @param  {number} iteration Integer count of how many recursions have already
 * been performed in creating this type definition.
 * @return {object}           Object of fields for given schema
 */
const createFields = ({
  schema,
  links,
  oas,
  allOTs,
  allIOTs,
  iteration,
  isMutation
}) => {
  let fields = {}

  // create fields for all properties:
  for (let propKey in schema.properties) {
    let prop
    if ('$ref' in schema.properties[propKey]) {
      prop = Oas3Tools.resolveRef(schema.properties[propKey]['$ref'], oas)
    } else {
      prop = schema.properties[propKey]
    }

    let nextIt = iteration + 1
    let otToAdd = getObjectType({
      name: propKey,
      schema: prop,
      links,
      oas,
      allOTs,
      allIOTs,
      iteration: nextIt,
      isMutation
    })
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
    // move iteration check outside?
    if (iteration === 0) {
      let operationId
      // TODO: href is yet another alternative to operationRef and operationId
      // if ('operationRef' in links[linkKey]) {
      //   operationId = Oas3Tools.resolveRef(links[linkKey].operationRef, oas).operationId
      // } else if ('operationId' in links[linkKey]) {
      if ('operationId' in links[linkKey]) {
        operationId = links[linkKey].operationId
      } else {
        throw new Error(`Link definition has neither "operationRef",
          "operationId", or "hRef" property`)
      }

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

      let linkArgs = getArgs({parameters: dynamicParams})

      // create resolve function:
      let linkResolver = ResolverBuilder.getResolver({
        path: op.path,
        method: op.method,
        endpoint: op.endpoint,
        oas,
        argsFromLink
      })

      fields[linkKey] = {
        type: allOTs[operationId],
        resolve: linkResolver,
        args: linkArgs
      }
    }
  }
  return fields
}

/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type.
 *
 * @param  {array}  options.parameters    List of OAS parameters
 * @param  {object} options.reqSchema     JSON-schema describing request payload
 * @param  {string} options.reqSchemaName Name of request payload schema
 * @param  {object} options.oas
 * @param  {object} options.allOTs
 * @param  {object} options.allIOTs
 * @return {Object}                       Key: name of argument, value: object
 * stating the parameter type
 */
const getArgs = ({
  parameters,
  reqSchema,
  reqSchemaName,
  oas,
  allOTs,
  allIOTs
}) => {
  let args = {}

  // handle params:
  for (let i in parameters) {
    let param = parameters[i]

    if (typeof param.name !== 'string') {
      console.log(`Warning: ignore parameter with missing "name" property: ${param}`)
      continue
    }
    let name = Oas3Tools.sanitize(param.name)

    let type = GraphQLString

    if ('schema' in param &&
      'type' in param.schema &&
      !(param.schema.type === 'object' || param.schema.type === 'array')) {
      type = getScalarType(param.schema.type)
    }

    args[name] = {
      type: param.required ? new GraphQLNonNull(type) : type
    }
  }

  // handle reqBodySchema:
  if (typeof reqSchema === 'object') {
    let inputType = getObjectType({
      name: reqSchemaName,
      schema: reqSchema,
      oas,
      allOTs,
      allIOTs,
      isMutation: true
    })
    let topLevelType = Oas3Tools.getSchemaType(reqSchema)
    if (topLevelType === 'array') {
      args[reqSchemaName] = inputType
    } else if (topLevelType === 'object') {
      args[reqSchemaName] = {
        type: inputType
      }
    }
  }

  return args
}

/**
 * Returns the scalar GraphQL type matching the given JSON schema type.
 *
 * @param  {string} type Scalar JSON schema type
 * @return {string}      Scalar GraphQL type
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
  getObjectType,
  getArgs
}
