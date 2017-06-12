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
 * Creates a GraphQL (Input) Object Type for the given JSON schema.
 *
 * Nested example: https://gist.github.com/xpepermint/7376b8c67caa926e19d2
 *
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
 * @param  {string}  options.name   Name of the (Input) Object Type to create
 * @param  {object}  options.schema JSON schema of the (Input) Object Type to
 * create
 * @param  {obejct}  options.data   Data produced by preprocessing
 * @param  {object}  options.links  Links belonging to (Input) Object Type
 * @param  {object}  oas            OpenAPI Specification 3.0
 * @param  {Number}  iteration      Integer count of recursions used to create
 * this schema
 * @param  {Boolean} isMutation     Whether to create an Input Object Type
 * @return {object}                 GraphQLObjectType | GraphQLInputObjectType |
 * GraphQLList | Scalar GraphQL type
 */
const getObjectType = ({
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

  // some error checking:
  if (typeof schema !== 'object') {
    throw new Error(`Invalid schema provided of type ${typeof schema}`)
  }

  // determine the type of the schema:
  let type = Oas3Tools.getSchemaType(schema)
  if (!type) {
    throw new Error(`Schema has no/wrong type: ${JSON.stringify(schema)}`)
  }

  // CASE: object - create ObjectType:
  if (type === 'object') {
    if (!isMutation) {
      if (name in data.objectTypes) {
        return data.objectTypes[name]
      } else {
        // ensure name in OT is sanitized:
        let saneName = Oas3Tools.beautify(name)
        data.objectTypes[name] = new GraphQLObjectType({
          name: saneName,
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
        return data.objectTypes[name]
      }
    } else {
      if (name in data.inputObjectTypes) {
        return data.inputObjectTypes[name]
      } else {
        // ensure name in OT is sanitized:
        let saneName = Oas3Tools.beautify(name)
        data.inputObjectTypes[name] = new GraphQLInputObjectType({
          name: saneName,
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
        return data.inputObjectTypes[name]
      }
    }

  // case: ARRAY - create ArrayType:
  } else if (type === 'array') {
    // minimal error-checking:
    if (!('items' in schema)) {
      throw new Error(`Items property missing in array schema definition`)
    }

    // if items are referenced, try to reuse or store schema:
    if ('$ref' in schema.items) {
      let itemsName = schema.items['$ref'].split('/').pop()

      let itemsOt = reuseOrCreateOt({
        name: itemsName,
        data,
        links,
        oas,
        iteration,
        isMutation
      })
      return new GraphQLList(itemsOt)
    } else {
      // determine name of items:
      let itemsName = 'ArrayItems'

      if ('title' in schema.items) {
        itemsName = schema.items.title
      }

      // determine the type of the items in the array:
      let itemsType = Oas3Tools.getSchemaType(schema.items)
      if (!itemsType) {
        throw new Error(`Type property missing in items schema`)
      }

      if (itemsType === 'object' || itemsType === 'array') {
        let type = getObjectType({
          name: itemsName,
          schema: schema.items, // schema not referenced, can't do better here
          data,
          links,
          oas,
          iteration: iteration + 1,
          isMutation
        })
        return new GraphQLList(type)
      } else {
        let type = getScalarType(itemsType)
        return new GraphQLList(type)
      }
    }

  // CASE: scalar
  } else {
    return getScalarType(type)
  }
}

/**
 * Returns an existing (Input) Object Type or creates a new one, and stores it
 * in data.
 *
 * @param  {string} options.name        Name of the schema
 * @param  {object} options.data        Data produced by preprocessing
 * @param  {object} options.links       Links belonging to (Input) Object Type
 * @param  {object} options.oas         OpenAPI Specification 3.0
 * @param  {number} options.iteration   Integer count of recursions used to
 * create this schema
 * @param  {boolean} options.isMutation Whether to create an Input Object Type
 * @return {object}                     GraphQLObjectType | GraphQLInputObjectType |
 * GraphQLList | Scalar GraphQL type
 */
const reuseOrCreateOt = ({
  name,
  data,
  links,
  oas,
  iteration,
  isMutation
}) => {
  if (!isMutation) {
    if (name in data.objectTypes) {
      return data.objectTypes[name]
    } else {
      let itemsType = getObjectType({
        name: name,
        schema: data.objectTypeDefs[name],
        data,
        links,
        oas,
        iteration: iteration + 1,
        isMutation
      })
      data.objectTypes[name] = itemsType
      return itemsType
    }
  } else {
    let inputName = name + 'Input'
    if (inputName in data.inputObjectTypes) {
      return data.inputObjectTypes[inputName]
    } else {
      let itemsType = getObjectType({
        name: inputName,
        schema: data.inputObjectTypeDefs[inputName],
        data,
        links,
        oas,
        iteration: iteration + 1,
        isMutation
      })
      data.inputObjectTypes[inputName] = itemsType
      return itemsType
    }
  }
}

/**
 * Creates the fields object to be used by an ObjectType.
 *
 * @param  {object} options.schema      JSON schema to create fields for
 * @param  {object} options.links       Links belonging to (Input) Object Type
 * @param  {object} options.data        Data produced by preprocessing
 * @param  {object} options.oas         OpenAPI Specification 3.0
 * @param  {number} options.iteration
 * @param  {boolean} options.isMutation
 * @return {object}                     Object containing fields
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

  /**
   * Create fields for properties
   */
  for (let propName in schema.properties) {
    let objectType // holds the object type to for this prop

    // determine if this property is required in mutations:
    let requiredMutationProp = (isMutation &&
      ('required' in schema) &&
      schema.required.includes(propName))

    // if properties are referenced, try to reuse schemas:
    if ('$ref' in schema.properties[propName]) {
      propName = schema.properties[propName]['$ref'].split('/').pop()
      objectType = reuseOrCreateOt({
        name: propName,
        data,
        links,
        oas,
        iteration,
        isMutation
      })
    // if no reference was found, we create the schema:
    // NOTE: we do not try to reuse a schema based on the propName here, because
    // the propName could collide with a schema name.
    } else {
      let propSchema = schema.properties[propName]

      // TODO: we have to be careful not to assign an already existing name to the
      // property's Object Type...
      if (propName in data.objectTypeDefs ||
        propName in data.inputObjectTypeDefs) {
        console.error(`Warning: creating Object Type for property with colluding
          name ${propName}`)
      }

      objectType = getObjectType({
        name: propName,
        schema: propSchema,
        data,
        links,
        oas,
        iteration: iteration + 1,
        isMutation
      })
    }

    // finally, add the object type to the fields (using sanitized field name):
    let sanePropName = Oas3Tools.beautify(propName)
    fields[sanePropName] = {
      type: requiredMutationProp ? new GraphQLNonNull(objectType) : objectType,
      description: schema.description // might be undefined
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
      //   operationId = Oas3Tools.resolveRef(links[linkKey].operationRef, oas).operationId
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
      for (let linkParamKey in linkParameters) {
        argsFromLink[linkParamKey] = linkParameters[linkParamKey].split('body#/')[1]
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
        argsFromLink
      })

      // get args for link:
      let args = getArgs({parameters: dynamicParams})

      // get response object type:
      let resObjectType = data.objectTypes[linkedOp.resSchemaName]

      // finally, add the object type to the fields (using sanitized field name):
      let saneLinkKey = Oas3Tools.beautify(linkKey)
      fields[saneLinkKey] = {
        type: resObjectType,
        resolve: linkResolver,
        args: args
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
 * @param  {string} options.reqSchemaName Name of request payload schema
 * @param  {boolean}options.reqSchemaRequired Whether the request schema is
 * required
 * @param  {object} options.oas
 * @param  {object} options.data
 * @return {Object}                       Key: name of argument, value: object
 * stating the parameter type
 */
const getArgs = ({
  parameters,
  reqSchemaName,
  reqSchemaRequired = false,
  oas,
  data
}) => {
  let args = {}

  // handle params:
  for (let i in parameters) {
    let param = parameters[i]

    if (typeof param.name !== 'string') {
      console.error(`Warning: ignore parameter with no "name" property: ${param}`)
      continue
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
    let reqObjectType
    if (reqSchemaName in data.inputObjectTypes) {
      reqObjectType = data.inputObjectTypes[reqSchemaName]
    } else {
      reqObjectType = getObjectType({
        name: reqSchemaName,
        schema: data.inputObjectTypeDefs[reqSchemaName],
        data,
        oas,
        isMutation: true
      })
    }

    // sanitize the argument name
    let saneName = Oas3Tools.beautify(reqSchemaName)

    args[saneName] = {
      type: reqSchemaRequired ? new GraphQLNonNull(reqObjectType) : reqObjectType,
      description: data.inputObjectTypeDefs[reqSchemaName].description // might be undefined
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
