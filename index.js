'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType
} = require('graphql')
const SchemaBuilder = require('./src/schema_builder.js')
const ResolverBuilder = require('./src/resolver_builder.js')
const GraphQLTools = require('./src/graphql_tools.js')
const Preprocessor = require('./src/preprocessor.js')

// increase stack trace logging for better debugging:
Error.stackTraceLimit = Infinity

/**
 * Creates a GraphQL interface from the given OpenAPI Specification.
 *
 * @param  {object} oas OpenAPI Specification 3.0
 * @return {promise}    Resolves on GraphQLSchema, rejects on error during
 * schema creation
 */
const createGraphQlSchema = oas => {
  return new Promise((resolve, reject) => {
    // TODO: validate OAS

    /**
     * Result of preprocessing OAS.
     *
     * {
     *  objectTypeDefs      // key: schemaName, val: JSON schema
     *  objectTypes         // key: schemaName, val: GraphQLObjectType
     *  inputObjectTypeDefs // key: schemaName, val: JSON schema
     *  inputObjectTypes    // key: schemaName, val: GraphQLInputObjectType
     *  operations {
     *    path
     *    method
     *    resSchemaName
     *    reqSchemaName
     *    reqSchemaRequired
     *    links
     *    parameters
     *  }
     * }
     *
     * @type {Object}
     */
    let data = Preprocessor.preprocessOas(oas)
    // console.log(JSON.stringify(data, null, 2))
    /**
     * Holds on to the highest-level (entry-level) object types for queries
     * that are accessible in the schema to build.
     *
     * @type {Object}
     */
    let rootQueryFields = {}

    /**
     * Holds on to the highest-level (entry-level) object types for mutations
     * that are accessible in the schema to build.
     *
     * @type {Object}
     */
    let rootMutationFields = {}

    /**
     * Translate every endpoint to GraphQL schemes.
     */
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length > 0) {
        let field = getFieldForOperation(operation, data, oas)

        if (operation.method.toLowerCase() === 'get') {
          rootQueryFields[operation.resSchemaName] = field
        } else {
          rootMutationFields[operationId] = field
        }
      }
    }

    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length === 0) {
        let field = getFieldForOperation(operation, data, oas)

        if (operation.method.toLowerCase() === 'get') {
          rootQueryFields[operation.resSchemaName] = field
        } else {
          rootMutationFields[operationId] = field
        }
      }
    }

    // console.log(rootQueryFields)
    // build up the schema:
    let schemaDef = {}
    if (Object.keys(rootQueryFields).length > 0) {
      schemaDef.query = new GraphQLObjectType({
        name: 'RootQueryType',
        fields: rootQueryFields
      })
    } else {
      schemaDef.query = GraphQLTools.getEmptyObjectType()
    }
    if (Object.keys(rootMutationFields).length > 0) {
      schemaDef.mutation = new GraphQLObjectType({
        name: 'RootMutationType',
        fields: rootMutationFields
      })
    }

    let schema = new GraphQLSchema(schemaDef)

    resolve(schema)
  })
}

const getFieldForOperation = (operation, data, oas) => {
  // determine type:
  let type = data.objectTypes[operation.resSchemaName]
  if (typeof type === 'undefined') {
    type = SchemaBuilder.getObjectType({
      name: operation.resSchemaName,
      schema: data.objectTypeDefs[operation.resSchemaName],
      data: data,
      links: operation.links,
      oas
    })
  }

  // determine resolve function:
  let resolve = ResolverBuilder.getResolver({
    path: operation.path,
    method: operation.method,
    oas,
    payloadName: operation.reqSchemaName
  })

  // determine args:
  let args = SchemaBuilder.getArgs({
    parameters: operation.parameters,
    reqSchemaName: operation.reqSchemaName,
    oas,
    data,
    reqSchemaRequired: operation.reqSchemaRequired
  })

  return {
    type: type,
    resolve: resolve,
    args: args
  }
}

module.exports = {
  createGraphQlSchema
}
