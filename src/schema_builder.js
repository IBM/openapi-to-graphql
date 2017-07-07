'use strict'

const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInputObjectType,
  GraphQLEnumType
} = require('graphql')
const Oas3Tools = require('./oas_3_tools.js')
const ResolverBuilder = require('./resolver_builder.js')
const Preprocessor = require('./preprocessor.js')
const log = require('debug')('translation')

/**
 * Creates a GraphQL (Input) Type for the given JSON schema.
 *
 * @param  {String}  options.name   Name of the type to create (ignored for
 * scalar types)
 * @param  {object}  options.schema JSON schema
 * @param  {Object}  options.data   Data produced by preprocessing
 * @param  {Object}  options.links  Links belonging to (Input) Type
 * @param  {Object}  oas            OpenAPI Specification 3.0
 * @param  {Number}  iteration      Count of recursions used to create type
 * @param  {Boolean} isMutation     Whether to create an Input Type
 * @return {Object}                 GraphQLObjectType | GraphQLInputObjectType |
 * GraphQLList | Scalar GraphQL type
 */
const getGraphQLType = ({
  name,
  schema,
  data,
  links = {},
  oas,
  iteration = 0,
  isMutation = false
}) => {
  // avoid excessive iterations:
  if (iteration === 20) {
    throw new Error(`Too many iterations when creating schema ${name}`)
  }

  // no valid schema name:
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid schema name provided`)
  }

  // some error checking:
  if (!schema || typeof schema !== 'object') {
    throw new Error(`Invalid schema for ${name} provided of type ` +
      `"${typeof schema}"`)
  }

  // determine the type of the schema:
  let type = Oas3Tools.getSchemaType(schema)

  // CASE: No known type
  if (!type) {
    log(`Warning: skipped creation of (Input) Type "${name}", which has no ` +
      `valid schema type. Schema: ${JSON.stringify(schema)}`)
    return null

  // CASE: object - create ObjectType:
  } else if (type === 'object') {
    return reuseOrCreateOt({
      name,
      schema,
      data,
      links,
      oas,
      iteration,
      isMutation
    })

  // CASE: enum:
  } else if (type === 'enum') {
    return reuseOrCreateEnum({
      name,
      data,
      enumList: schema.enum
    })

  // CASE: ARRAY - create ArrayType:
  } else if (type === 'array') {
    return reuseOrCreateList({
      name,
      data,
      schema,
      links,
      oas,
      iteration,
      isMutation
    })

  // CASE: scalar
  } else {
    return getScalarType(type)
  }
}

/**
 * Returns an existing List Type or creates a new one, and stores it in data.
 *
 * @param  {String} options.name        Name of the list type
 * @param  {Object} options.data        Data produced by preprocessing
 * @param  {Object} options.schema      JSON schema describing list
 * @param  {Object} options.links       Links belonging to (Input) Type
 * @param  {Object} options.oas         OpenAPI Specification 3.0
 * @param  {Number} options.iteration   Count of recursions used to create type
 * @param  {Boolean} options.isMutation Whether to create an Input Type
 * @return {GraphQLList}
 */
const reuseOrCreateList = ({
  name,
  data,
  schema,
  links,
  oas,
  iteration,
  isMutation
}) => {
  // minimal error-checking:
  if (!('items' in schema)) {
    throw new Error(`Items property missing in array schema definition of ` +
      `${name}`)
  }

  let def = Preprocessor.createOrReuseDataDef(schema, {fromRef: `${name}List`}, data)

  // try to reuse existing (Input) Object Type
  if (!isMutation && typeof def.ot !== 'undefined') {
    log(`reuse  GraphQLList "${def.otName}"`)
    return def.ot
  } else if (isMutation && typeof def.iot !== 'undefined') {
    log(`reuse  GraphQLList "${def.iotName}"`)
    return def.iot
  }

  // create new (Input) Object Type
  log(`create GraphQLList "${def.otName}"`)

  // determine itemsType:
  let itemsSchema = schema.items
  let itemsName = `${name}ListItem`
  if ('$ref' in itemsSchema) {
    itemsSchema = Oas3Tools.resolveRef(itemsSchema['$ref'], oas)
    itemsName = schema.items['$ref'].split('/').pop()
  }

  let itemsType = getGraphQLType({
    name: itemsName,
    schema: itemsSchema,
    data,
    links,
    oas,
    iteration: iteration + 1,
    isMutation
  })

  let listObjectType = new GraphQLList(itemsType)

  // store newly created List (Input) Object Type:
  if (!isMutation) {
    def.ot = listObjectType
  } else {
    def.iot = listObjectType
  }

  return listObjectType
}

/**
 * Returns an existing Enum Type or creates a new one, and stores it in data.
 *
 * @param  {String} options.name     Name of the enum type
 * @param  {Object} options.data     Data produced by preprocessing
 * @param  {Array}  options.enumList List of enum entries
 * @return {GraphQLEnumType}
 */
const reuseOrCreateEnum = ({
  name,
  data,
  enumList
}) => {
  let def = Preprocessor.createOrReuseDataDef(enumList, {fromRef: name}, data)

  if (typeof def.ot !== 'undefined') {
    log(`reuse  GraphQLEnumType "${def.otName}"`)
    return def.ot
  } else {
    log(`create GraphQLEnumType "${def.otName}"`)
    let values = {}
    enumList.forEach(e => {
      values[Oas3Tools.beautify(e)] = {
        value: e
      }
    })
    def.ot = new GraphQLEnumType({
      name: def.otName,
      values
    })
    return def.ot
  }
}

/**
 * Returns an existing (Input) Object Type or creates a new one, and stores it
 * in data.
 * A returned GraphQLObjectType has the following internal structure:
 *
 *   new GraphQLObjectType({
 *     name        // optional name of the type
 *     description // optional description of type
 *     fields      // REQUIRED thunk returning fields
 *       type      // REQUIRED definition of the field type
 *       args      // optional definition of types
 *       resolve   // optional function defining how to obtain this type
 *   })
 *
 * @param  {String} options.name        Name of the schema
 * @param  {Object} options.data        Data produced by preprocessing
 * @param  {Object} options.links       Links belonging to (Input) Object Type
 * @param  {Object} options.oas         OpenAPI Specification 3.0
 * @param  {Number} options.iteration   Integer count of recursions used to
 * create this schema
 * @param  {Boolean} options.isMutation Whether to create an Input Object Type
 * @return {GraphQLObjectType|GraphQLInputObjectType}
 */
const reuseOrCreateOt = ({
  name,
  schema,
  data,
  links,
  oas,
  iteration = 0,
  isMutation
}) => {
  // some validation:
  if (typeof schema === 'undefined') {
    throw new Error(`no schema passed to reuseOrCreateOt for name ${name}`)
  }

  // fetch or create data definition:
  let def = Preprocessor.createOrReuseDataDef(schema, {fromRef: name}, data)

  // CASE: query - create or reuse OT
  if (!isMutation) {
    if (typeof def.ot !== 'undefined') {
      log(`reuse  Object Type "${def.otName}"`)
      return def.ot
    } else {
      log(`create Object Type "${def.otName}"`)

      def.ot = new GraphQLObjectType({
        name: def.otName,
        description: schema.description, // might be undefined
        fields: () => {
          return createFields({
            schemaName: name,
            schema,
            data,
            links,
            oas,
            iteration,
            isMutation
          })
        }
      })
      return def.ot
    }
  // CASE: mutation - create or reuse IOT
  } else {
    if (typeof def.iot !== 'undefined') {
      log(`reuse  Input Object Type "${def.iotName}"`)
      return def.iot
    } else {
      log(`create Input Object Type "${def.iotName}"`)
      def.iot = new GraphQLInputObjectType({
        name: def.iotName,
        description: schema.description, // might be undefined
        fields: () => {
          return createFields({
            schemaName: name,
            schema,
            data,
            links,
            oas,
            iteration,
            isMutation
          })
        }
      })
      return def.iot
    }
  }
}

/**
 * Creates the fields object to be used by an ObjectType.
 *
 * @param  {Object} options.schema      JSON schema to create fields for
 * @param  {Object} options.links       Links belonging to (Input) Object Type
 * @param  {Object} options.data        Data produced by preprocessing
 * @param  {Object} options.oas         OpenAPI Specification 3.0
 * @param  {Number} options.iteration
 * @param  {Boolean} options.isMutation
 * @return {Object}                     Object containing fields
 */
const createFields = ({
  schema,
  links,
  data,
  oas,
  iteration,
  isMutation
}) => {
  let fields = {}

  // resolve $ref:
  if ('$ref' in schema) {
    schema = Oas3Tools.resolveRef(schema['$ref'], oas)
  }

  /**
   * Create fields for properties
   */
  for (let propName in schema.properties) {
    let propSchema = schema.properties[propName]
    let schemaName = propName // name of schema for this prop's field

    // determine if this property is required in mutations:
    let reqMutationProp = (isMutation &&
      ('required' in schema) &&
      schema.required.includes(propName))

    // if properties are referenced, try to reuse schemas:
    if ('$ref' in propSchema) {
      schemaName = propSchema['$ref'].split('/').pop()
      propSchema = Oas3Tools.resolveRef(propSchema['$ref'], oas)
    }

    // get object type describing the property:
    let objectType = getGraphQLType({
      name: schemaName,
      schema: propSchema,
      data,
      links,
      oas,
      iteration: iteration + 1,
      isMutation
    })

    // finally, add the object type to the fields (using sanitized field name):
    if (objectType) {
      let sanePropName = Oas3Tools.beautifyAndStore(propName, data.saneMap)
      fields[sanePropName] = {
        type: reqMutationProp ? new GraphQLNonNull(objectType) : objectType,
        description: propSchema.description // might be undefined
      }
    }
  }

  /**
   * Create fields for links
   */
  if (iteration === 0) {
    for (let linkKey in links) {
      // get linked operation:
      let linkedOpId
      // TODO: href is yet another alternative to operationRef and operationId
      // if ('operationRef' in links[linkKey]) {
      //   operationId = Oas3Tools.resolveRef(links[linkKey].operationRef, oas)
      //   .operationId
      // } else if ('operationId' in links[linkKey]) {
      if ('operationId' in links[linkKey]) {
        linkedOpId = links[linkKey].operationId
      } else {
        throw new Error(`Link definition has neither "operationRef",
          "operationId", or "hRef" property`)
      }
      let linkedOp = data.operations[linkedOpId]

      // determine parameters provided via link:
      let linkParameters = links[linkKey].parameters
      let argsFromLink = {}
      for (let paramKey in linkParameters) {
        argsFromLink[paramKey] = linkParameters[paramKey].split('body#/')[1]
      }

      // remove argsFromLinks from operation parameters:
      let endpointParameters = linkedOp.parameters
      let dynamicParams = endpointParameters.filter(p => {
        return !(p.name in argsFromLink)
      })

      // get resolve function for link:
      let linkResolver = ResolverBuilder.getResolver({
        operation: linkedOp,
        oas,
        argsFromLink,
        data
      })

      // get args for link:
      let args = getArgs({
        parameters: dynamicParams,
        oas,
        data
      })

      // get response object type:
      // (We just use the reference here. The OT will be built up some other
      // time.)
      let resObjectType = linkedOp.resDef.ot

      // finally, add the object type to the fields (using sanitized field name):
      let saneLinkKey = Oas3Tools.beautifyAndStore(linkKey, data.saneMap)
      fields[saneLinkKey] = {
        type: resObjectType,
        resolve: linkResolver,
        args: args,
        description: links[linkKey].description // may be undefined
      }
    }
  }

  return fields
}

/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type.
 *
 * @param  {Array}  options.parameters    List of OAS parameters
 * @param  {Object} options.reqSchema     JSON schema of request
 * @param  {String} options.reqSchemaName Name of request payload schema
 * @param  {Boolean}options.reqSchemaRequired Whether the request schema is
 * required
 * @param  {Object} options.oas
 * @param  {Object} options.data
 * @return {Object}                       Key: name of argument, value: object
 * stating the parameter type
 */
const getArgs = ({
  parameters,
  reqSchema,
  reqSchemaName,
  reqRequired = false,
  oas,
  data
}) => {
  let args = {}

  // handle params:
  for (let i in parameters) {
    let param = parameters[i]

    // we need at least a name:
    if (typeof param.name !== 'string') {
      log(`Warning: ignore parameter with no "name" property: ${param}`)
      continue
    }

    // if this parameter is provided via options, ignore:
    if (typeof data.options === 'object') {
      if (typeof data.options.headers === 'object' &&
        param.name in data.options.headers) {
        continue
      }
      if (typeof data.options.qs === 'object' &&
        param.name in data.options.qs) {
        continue
      }
    }

    // determine type of parameter (often, there is none - assume string):
    let type = GraphQLString
    if ('schema' in param &&
      'type' in param.schema &&
      !(param.schema.type === 'object' || param.schema.type === 'array')) {
      type = getScalarType(param.schema.type)
    }

    // sanitize the argument name
    // NOTE: when matching these parameters back to requests, we need to again
    // use the real parameter name.
    let saneName = Oas3Tools.beautify(param.name)

    args[saneName] = {
      type: param.required ? new GraphQLNonNull(type) : type,
      description: param.description // might be undefined
    }
  }

  // handle reqBodySchema:
  if (typeof reqSchemaName === 'string') {
    let reqObjectType = getGraphQLType({
      name: reqSchemaName,
      schema: reqSchema,
      data,
      oas,
      isMutation: true
    })

    if (reqObjectType) {
      // sanitize the argument name
      let saneName = Oas3Tools.beautify(reqSchemaName)
      args[saneName] = {
        type: reqRequired ? new GraphQLNonNull(reqObjectType) : reqObjectType,
        description: reqSchema.description // might be undefined
      }
    }
  }

  return args
}

/**
 * Returns the scalar GraphQL type matching the given JSON schema type.
 *
 * @param  {String} type Scalar JSON schema type
 * @return {String}      Scalar GraphQL type
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
      return GraphQLString
  }
}

module.exports = {
  getGraphQLType,
  getArgs
}
