'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType
} = require('graphql')
const SchemaBuilder = require('./src/schema_builder.js')
const ResolverBuilder = require('./src/resolver_builder.js')
const Oas3Tools = require('./src/oas_3_tools.js')

Error.stackTraceLimit = Infinity

/**
 * Creates a GraphQL interface from the given OpenAPI Specification.
 *
 * @param  {object} oas OpenAPI Specification 3.0
 * @return {GraphQLSchema}
 */
const createGraphQlSchema = oas => {
  // TODO: validate OAS

  // Create a GraphQL Object Type definitions for every resource defined in OAI.
  let rootFields = {}
  let allOTs = {} // key: operationId or method:path, value: GraphQLObjectType

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
        let name = path.split('/').pop()
        if ('title' in schema) {
          name = schema.title
        }
        if ('$ref' in schema) {
          name = schema['$ref'].split('/').pop()
          schema = Oas3Tools.resolveRef(schema['$ref'], oas)
        }

        // get links:
        let links = {}
        if ('links' in endpoint.responses['200']) {
          for (let linkKey in endpoint.responses['200'].links) {
            let link = endpoint.responses['200'].links[linkKey]
            if ('$ref' in link) {
              link = Oas3Tools.resolveRef(link['$ref'], oas)
            }
            links[linkKey] = link
          }
        }

        // determine operationId:
        let operationId = endpoint.operationId
        if (typeof operationId === 'undefined') {
          operationId = `${method}:${path}`
        }

        // get ObjectType for operation:
        let type = SchemaBuilder.getTypeDef(name, schema, links, oas, allOTs)
        allOTs[operationId] = type

        rootFields[name] = {
          type: type,
          resolve: ResolverBuilder.getResolver(path, method, endpoint, oas),
          args: SchemaBuilder.getArgs(endpoint.parameters)
        }
      }
    }
  }

  let schemaDef = {
    query: new GraphQLObjectType({
      name: 'RootQueryType',
      fields: rootFields
    })
  }

  return new GraphQLSchema(schemaDef)
}

module.exports = {
  createGraphQlSchema: createGraphQlSchema
}
