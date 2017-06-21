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
const AuthBuilder = require('./src/auth_builder.js')
const Swagger2OpenAPI = require('swagger2openapi')
const OASValidator = require('swagger2openapi/validate.js')
const log = require('debug')('translation')

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
 *  TODO: edit below
 * - OasGraph can handle authentication through GraphQL. To do this, we can
 *  create two new intermediate Object Types called QueryViewer and
 *  MutationViewer that we can use to pass security credentials through the
 *  resolver context. We identify all the different security protocols and
 *  create parameters for the Viewer Object Types based on the data that each
 *  protocol requires. For example, a protocol that uses an API key will require
 *  a parameter to pass an API key and a protocol that uses Basic Auth will
 *  require two parameters to pass a username and password. Because GraphQL rely
 *  on sanitized strings for fields, we have to sanitize our parameter names,
 *  which take the form ${protocol name}_${protocol field} (e.g. MyApiKey_apiKey
 *  and MyBasicAuth_username and MyBasicAuth_password).
 *
 * @param  {object} spec Swagger / OpenAPI Specification 2.0 / 3.0.x
 * @return {promise}     Resolves on GraphQLSchema, rejects on error during
 * schema creation
 */
const createGraphQlSchema = (spec, options = {}) => {
  return new Promise((resolve, reject) => {
    // Some basic validation OAS
    if (typeof spec !== 'object') {
      throw new Error(`Invalid specification provided`)
    }

    // CASE: translate
    if (typeof spec.swagger === 'string' && spec.swagger === '2.0') {
      log(`Received Swagger - going to translate...`)
      Swagger2OpenAPI.convertObj(spec, {})
        .then(result => {
          resolve(translateOpenApiToGraphQL(result.openapi, options))
        })
        .catch(reject)
    // CASE: validate
    } else if (typeof spec.openapi === 'string' && /^3/.test(spec.openapi)) {
      log(`Received OpenAPI 3.0.x - going to validate...`)
      let valid = true
      try {
        valid = OASValidator.validateSync(spec, {})
      } catch (err) {
        reject(err)
      }
      if (!valid) {
        reject(new Error(`Validation of OpenAPI Specification failed`))
      } else {
        log(`OpenAPI Specification is validated`)
        resolve(translateOpenApiToGraphQL(spec, options))
      }
    }
  })
}

/*
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x.
 *
 * @param  {object} oas OpenAPI Specification 3.0
 * @return {promise}    Resolves on GraphQLSchema, rejects on error during
 * schema creation
 */
const translateOpenApiToGraphQL = (oas, {headers, qs, viewer}) => {
  return new Promise((resolve, reject) => {
    log(`Translate valid OpenAPI specification to GraphQL...`)

    /**
     * Result of preprocessing OAS:
     *
     * {
     *  objectTypeDefs      // key: schemaName, val: JSON schema
     *  objectTypes         // key: schemaName, val: GraphQLObjectType
     *  inputObjectTypeDefs // key: schemaName, val: JSON schema
     *  inputObjectTypes    // key: schemaName, val: GraphQLInputObjectType
     *  saneMap             // key: sanitized value, val: raw value
     *  security            // key: schemaName, val: JSON schema
     *  operations {
     *    path
     *    method
     *    resSchemaName
     *    reqSchemaName
     *    reqSchemaRequired
     *    links
     *    parameters
     *    securityProtocols
     *  }
     * }
     *
     * @type {Object}
     */
    let data = Preprocessor.preprocessOas(oas)

    /**
     * Store options to data
     */
    data.options = {headers, qs, viewer}
    log(`Provided options: ${JSON.stringify(data.options)}`)

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
     * Intermediate field used to input authentication credentials for queries
     *
     * @type {Object}
     */
    let viewerQueryFields = {}

    /**
     * Intermediate field used to input authentication credentials for mutations
     *
     * @type {Object}
     */
    let viewerMutationFields = {}

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
          if (Object.keys(operation.securityProtocols).length > 0 && data.options.viewer !== false) {
            viewerQueryFields[saneName] = field
          } else {
            rootQueryFields[saneName] = field
          }
        } else {
          let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
          if (Object.keys(operation.securityProtocols).length > 0 && data.options.viewer !== false) {
            viewerMutationFields[saneName] = field
          } else {
            rootMutationFields[saneName] = field
          }
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
          if (Object.keys(operation.securityProtocols).length > 0 && data.options.viewer !== false) {
            viewerQueryFields[saneName] = field
          } else {
            rootQueryFields[saneName] = field
          }
        } else {
          let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
          if (Object.keys(operation.securityProtocols).length > 0 && data.options.viewer !== false) {
            viewerMutationFields[saneName] = field
          } else {
            rootMutationFields[saneName] = field
          }
        }
      }
    }

    // create and add viewer object types to the query and mutation object types if applicable
    if (Object.keys(viewerQueryFields).length > 0) {
      let {viewerOT, args, resolve} = AuthBuilder.getViewerOT(data, viewerQueryFields, 'queryViewer')
      rootQueryFields.queryViewer = {
        type: viewerOT,
        resolve,
        args
      }
    }

    if (Object.keys(viewerMutationFields).length > 0) {
      let {viewerOT, args, resolve} = AuthBuilder.getViewerOT(data, viewerMutationFields, 'mutationViewer')
      rootMutationFields.mutationViewer = {
        type: viewerOT,
        resolve,
        args
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
