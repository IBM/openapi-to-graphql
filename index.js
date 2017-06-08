'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType
} = require('graphql')
const SchemaBuilder = require('./src/schema_builder.js')
const ResolverBuilder = require('./src/resolver_builder.js')
const Oas3Tools = require('./src/oas_3_tools.js')

Error.stackTraceLimit = Infinity

const mutationMethods = ['post', 'put', 'patch', 'delete']

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
        if ('responses' in endpoint &&
          '200' in endpoint.responses &&
          'content' in endpoint.responses['200'] &&
          'application/json' in endpoint.responses['200'].content &&
          'schema' in endpoint.responses['200'].content['application/json']) {
          // determine schema and name:
          let schema = endpoint.responses['200'].content['application/json'].schema
          let name = Oas3Tools.inferResourceNameFromPath(path)

          if ('$ref' in schema) {
            name = schema['$ref'].split('/').pop()
            schema = Oas3Tools.resolveRef(schema['$ref'], oas)
          }
          if ('title' in schema) {
            name = schema.title
          }

          // mutating operations have a special name:
          if (mutationMethods.includes(method.toLowerCase())) {
            name = method.toLowerCase() + name.charAt(0).toUpperCase() + name.slice(1)
          }

          // get links:
          let links = Oas3Tools.getEndpointLinks(endpoint, oas)

          // TODO: get parameters:
          // let parameters = Oas3Tools.getEndpointParameters(endpoint, oas)

          // get requestBody schema:
          let reqBodySchema = Oas3Tools.getEndpointReqBodySchema(endpoint, oas)

          // determine operationId:
          let operationId = endpoint.operationId
          if (typeof operationId === 'undefined') {
            operationId = `${method}:${path}`
          }

          // get ObjectType for operation:
          let type = SchemaBuilder.getObjectTypeDef(name, schema, links, oas, allOTs, allIOTs)
          allOTs[operationId] = type

          // get resolver for operation:
          let resolver = ResolverBuilder.getResolver(path, method, endpoint, oas, {}, name)

          // get arguments for operation:
          let args = SchemaBuilder.getArgs(endpoint.parameters, reqBodySchema, name, oas, allOTs, allIOTs)

          let field = {
            type: type,
            resolve: resolver,
            args: args
          }
          if (method.toLowerCase() === 'get') {
            rootQueryFields[name] = field
          } else if (mutationMethods.includes(method.toLowerCase())) {
            rootMutationFields[name] = field
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
