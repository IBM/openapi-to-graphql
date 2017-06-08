'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType
} = require('graphql')
const SchemaBuilder = require('./src/schema_builder.js')
const ResolverBuilder = require('./src/resolver_builder.js')
const Oas3Tools = require('./src/oas_3_tools.js')
const GraphQLTools = require('./src/graphql_tools.js')

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
     * Holds on to defined GraphQL object types so they can be reused.
     *
     * @type {Object} key: operationId, operationRef, method:path, or schemaname
     *                value: GraphQLObjectType
     */
    let allOTs = {}

    /**
     * Holds on to the defined GraphQL input object types so they can be reused.
     *
     *  @type {Object}
     */
    let allIOTs = {}

    for (let path in oas.paths) {
      for (let method in oas.paths[path]) {
        let endpoint = oas.paths[path][method]
        if (Oas3Tools.endpointReturnsJson(endpoint)) {
          // get response schema and name:
          let {schemaName, schema} = Oas3Tools.getResSchemaAndName(path, method, oas)

          // get links:
          let links = Oas3Tools.getEndpointLinks(endpoint, oas)

          // get parameters:
          let parameters = Oas3Tools.getParameters(path, method, oas)

          // get requestBody schema:
          let {reqSchemaName, reqSchema} = Oas3Tools.getReqSchemaAndName(path, method, oas)

          // determine operationId:
          let operationId = endpoint.operationId
          if (typeof operationId === 'undefined') {
            operationId = `${method}:${path}`
          }

          // get ObjectType for operation:
          let type = SchemaBuilder.getObjectType({
            name: schemaName,
            schema,
            links,
            oas,
            allOTs,
            allIOTs
          })
          allOTs[operationId] = type

          // get resolver for operation:
          let resolver = ResolverBuilder.getResolver(path, method, endpoint, oas, {}, schemaName)

          // get arguments for operation:
          let args = SchemaBuilder.getArgs(parameters, reqSchema, reqSchemaName, oas, allOTs, allIOTs)

          let field = {
            type: type,
            resolve: resolver,
            args: args
          }

          if (method.toLowerCase() === 'get') {
            rootQueryFields[schemaName] = field
          } else if (Oas3Tools.mutationMethods.includes(method.toLowerCase())) {
            rootMutationFields[schemaName] = field
          }
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

    resolve(new GraphQLSchema(schemaDef))
  })
}

module.exports = {
  createGraphQlSchema
}
