'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType
} = require('graphql')
const SchemaBuilder = require('./src/schema_builder.js')
const ResolverBuilder = require('./src/resolver_builder.js')
const GraphQLTools = require('./src/graphql_tools.js')
const Preprocessor = require('./src/preprocessor.js')
const Oas3Tools = require('./src/oas_3_tools.js')

// increase stack trace logging for better debugging:
Error.stackTraceLimit = Infinity

/**
 * Creates a GraphQL interface from the given OpenAPI Specification.
 *
 * Some general notes:
 * - GraphQL interfaces rely on sanitized strings for (Input) Object Type names
 *   and fields. We perform sanitization only when assigning (field-) names, but
 *   keep keys in the OAS otherwise as-is, to ensure that inner-OAS references
 *   work as expected.
 * - GraphQL (Input) Object Types must have a unique name. Thus, sometimes Input
 *   Object Types and Object Types need separate names, despite them having the
 *   same structure. We thus append 'Input' to every Input Object Type's name
 *   as a convention.
 *
 * @param  {object} oas OpenAPI Specification 3.0
 * @return {promise}    Resolves on GraphQLSchema, rejects on error during
 * schema creation
 */
const createGraphQlSchema = (oas, {headers, qs} = {}) => {
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
     *  saneMap             // key: sanitized value, val: raw value
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

    /**
     * Store options to data
     */
    data.options = {headers, qs}

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
     *
     * Do this first for endpoints that DO contain links, so that built up
     * GraphQL object types that are reused contain these links.
     *
     * This necessitates a second iteration, though, for the endpoints that
     * DO NOT have links.
     */
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length > 0) {
        let field = getFieldForOperation(operation, data, oas)

        if (operation.method.toLowerCase() === 'get') {
          let saneName = Oas3Tools.beautifyAndStore(
            operation.resSchemaName,
            data.saneMap)
          rootQueryFields[saneName] = field
        } else {
          let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
          rootMutationFields[saneName] = field
        }
      }
    }
    // ...and again for endpoints without links:
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length === 0) {
        let field = getFieldForOperation(operation, data, oas)

        if (operation.method.toLowerCase() === 'get') {
          let saneName = Oas3Tools.beautifyAndStore(
            operation.resSchemaName,
            data.saneMap)
          rootQueryFields[saneName] = field
        } else {
          let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
          rootMutationFields[saneName] = field
        }
      }
    }

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

/**
 * Creates the field object for a given operation.
 *
 * @param  {object} operation Operation as produced by preprocessing
 * @param  {object} data      Data produced by preprocessing
 * @param  {object} oas       OpenAPI Specification 3.0
 * @return {object}           Field object
 */
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
    operation,
    oas,
    payloadName: operation.reqSchemaName,
    data
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
