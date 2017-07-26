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
const log = require('debug')('translation')

// Increase stack trace logging for better debugging:
Error.stackTraceLimit = Infinity

/**
 * Creates a GraphQL interface from the given OpenAPI Specification.
 *
 * Some general notes:
 *
 * - GraphQL interfaces rely on sanitized strings for (Input) Object Type names
 *   and fields. We perform sanitization only when assigning (field-) names, but
 *   keep keys in the OAS otherwise as-is, to ensure that inner-OAS references
 *   work as expected.
 *
 * - GraphQL (Input) Object Types must have a unique name. Thus, sometimes Input
 *   Object Types and Object Types need separate names, despite them having the
 *   same structure. We thus append 'Input' to every Input Object Type's name
 *   as a convention.
 *
 * - To pass data between resolve functions, OASGraph uses a _oasgraph object
 *   returned by every resolver in addition to its original data (OASGraph does
 *   not use the context to do so, which is an anti-pattern according to=
 *   https://github.com/graphql/graphql-js/issues/953).
 *
 * - OasGraph can handle basic authentication and api key-based authentication
 *   through GraphQL. To do this, OASGraph creates two new intermediate Object
 *   Types called QueryViewer and MutationViewer that take as input security
 *   credentials and pass them on using the _oasgraph object to other resolve
 *   functions.
 *
 * @param  {Object}  spec Swagger / OpenAPI Specification 2.0 / 3.0.x
 * @return {Promise}      Resolves on GraphQLSchema, rejects on error during schema creation
 */
const createGraphQlSchema = (spec, options = {}) => {
  return new Promise((resolve, reject) => {
    // Some basic validation
    if (typeof spec !== 'object') {
      throw new Error(`Invalid specification provided`)
    }

    // Check if the spec is a valid OAS 3.0.x
    // If the spec is OAS 2.0, attempt to translate it into 3.0.x
    // Then try to translate the spec into a GraphQL schema
    Oas3Tools.getValidOAS3(spec)
      .then(oas => {
        translateOpenApiToGraphQL(oas, options)
          .then(schema => {
            resolve(schema)
          })
          .catch(reject)
      })
      .catch(reject)
  })
}

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 *
 * Here is a list of the options we have currently implemented:
 * {
 *  {Boolean} strict           Adhere to the OAS as closely as possible
 *  {Object}  headers          Additional headers sent with every request while resolving queries
 *  {Object}  qs               Additional query parameters sent with every request while resolving queries
 *  {Boolean} viewer           Do not create authentication viewers. Intended to be used with
 *                              the headers option (i.e. if you provide all your authentication
 *                              data in the headers options, you do not have to authenticate
 *                              through the authentication viewers)
 *  {String}  tokenJSONpath    Path to the OAuth 2.0 token. Because of technical reasons, we
 *                              can create an OAuth 2.0 authentication viewer. Hence, the only
 *                              way for OASGraph to bypass OAuth 2.0 is when the outer
 *                              application provides it
 *  {Boolean} addSubOperations Combine queries with similar paths and inputs
 * }
 *
 * @param  {Object} oas     OpenAPI Specification 3.0
 * @param  {Object} options A few different options that we have implemented to allow users to
 *                           customize how they would like use our tool
 *
 * @return {Promise}        Resolves on GraphQLSchema, rejects on error during schema creation
 */
const translateOpenApiToGraphQL = (oas, {
  strict = false,
  headers,
  qs,
  viewer = true,
  tokenJSONpath,
  addSubOperations = false,
  sendOAuthTokenInQuery = false
}) => {
  return new Promise((resolve, reject) => {
    let options = {
      headers,
      qs,
      viewer,
      tokenJSONpath,
      strict,
      addSubOperations,
      sendOAuthTokenInQuery
    }
    log(`Options: ${JSON.stringify(options)}`)

    /**
     * Extract information from the OAS and put it inside a data structure that
     *  is easier for OASGraph to use
     *
     * @type {Object}
     */
    let data = Preprocessor.preprocessOas(oas, options)

    /**
     * Holds on to the highest-level (entry-level) object types for queries
     *  that are accessible in the schema to build
     *
     * @type {Object}
     */
    let rootQueryFields = {}

    /**
     * Holds on to the highest-level (entry-level) object types for mutations
     *  that are accessible in the schema to build
     *
     * @type {Object}
     */
    let rootMutationFields = {}

    /**
     * Intermediate field used to input authentication credentials for queries
     *
     * @type {Object}
     */
    let viewerFields = {}

    /**
     * Intermediate field used to input authentication credentials for mutations
     *
     * @type {Object}
     */
    let viewerMutationFields = {}

    /**
     * Translate every endpoint to GraphQL schemes.
     *
     * Do this first for endpoints that DO contain links OR that DO contain sub
     * operation, so that built up GraphQL object types that are reused contain
     * these links.
     *
     * This necessitates a second iteration, though, for the endpoints that
     * DO NOT have links.
     */
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length > 0 ||
      (Array.isArray(operation.subOps) && operation.subOps.length > 0)) {
        loadFields(
          {
            operation,
            operationId,
            data,
            oas,
            rootQueryFields,
            rootMutationFields,
            viewerFields,
            viewerMutationFields
          }
        )
      }
    }

    // ...and again for endpoints without links:
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length === 0 &&
        (!Array.isArray(operation.subOps) || operation.subOps.length === 0)) {
        loadFields(
          {
            operation,
            operationId,
            data,
            oas,
            rootQueryFields,
            rootMutationFields,
            viewerFields,
            viewerMutationFields
          }
        )
      }
    }

    const usedViewerNames = {} // keep track of viewer names we already used
    const usedMutationViewerNames = {} // keep track of mutationViewer names we already used

    // create and add viewer object types to the query and mutation object types if applicable
    if (Object.keys(viewerFields).length > 0) {
      let viewerNames = {
        // the underscore is import for generating camel case with beautify
        objectPreface: 'viewer_',
        anyAuthName: 'viewerAnyAuth'
      }
      AuthBuilder.createAndLoadViewer(
          oas,
          data,
          viewerNames,
          usedViewerNames,
          viewerFields,
          rootQueryFields
      )
    }

    if (Object.keys(viewerMutationFields).length > 0) {
      let mutationViewerNames = {
        // the underscore is import for generating camel case with beautify
        objectPreface: 'mutationViewer_',
        anyAuthName: 'mutationViewerAnyAuth'
      }
      AuthBuilder.createAndLoadViewer(
          oas,
          data,
          mutationViewerNames,
          usedMutationViewerNames,
          viewerMutationFields,
          rootMutationFields
      )
    }

    // build up the schema:
    let schemaDef = {}
    if (Object.keys(rootQueryFields).length > 0) {
      schemaDef.query = new GraphQLObjectType({
        name: 'RootQueryType',
        description: 'The start of any query',
        fields: rootQueryFields
      })
    } else {
      schemaDef.query = GraphQLTools.getEmptyObjectType()
    }
    if (Object.keys(rootMutationFields).length > 0) {
      schemaDef.mutation = new GraphQLObjectType({
        name: 'RootMutationType',
        description: 'The start of any mutation',
        fields: rootMutationFields
      })
    }

    // fill in yet undefined Object Types to avoid GraphQLSchema from breaking:
    for (let i in data.operations) {
      let operation = data.operations[i]
      if (typeof operation.resDef.ot === 'undefined') {
        operation.resDef.ot = GraphQLTools.getEmptyObjectType()
      }
    }

    let schema = new GraphQLSchema(schemaDef)

    resolve(schema)
  })
}

/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 *
 * @param  {object} operation Operation as produced by preprocessing
 * @param  {string} operationId Name used to identify a particular operation
 * @param  {object} data      Data produced by preprocessing
 * @param  {object} oas       OpenAPI Specification 3.0
 * @param  {object} rootQueryFields Object that contains the definition all
 * query objects type
 * @param  {object} rootMutationFields Object that contains the definition all
 * mutation objects type
 * @param  {object} viewerFields Object that contains the definition of all
 * authenticated query object types
 * @param  {object} viewerMutationFields Object that contains the definition of
 * all authenticated mutation object types
 */
const loadFields = (
  {
    operation,
    operationId,
    data,
    oas,
    rootQueryFields,
    rootMutationFields,
    viewerFields,
    viewerMutationFields
  }
) => {
  // get the fields for an operation
  let field = getFieldForOperation(operation, data, oas)

  // if the operation has no valid type, abort:
  if (!field.type || typeof field.type === 'undefined') {
    log(`Warning: skipped operation "${operation.method.toUpperCase()} ` +
      `${operation.path}" without defined Object Type.`)
    return
  }

  // determine if the operation is authenticated
  let isAuthenticated = Object.keys(operation.securityProtocols).length > 0 &&
    data.options.viewer !== false

  // CASE: query
  if (operation.method.toLowerCase() === 'get') {
    // use name of the response data schema as field name:
    let name = operation.resDef.otName

    if (isAuthenticated) {
      for (let protocolIndex in operation.securityProtocols) {
        for (let protocolName in operation.securityProtocols[protocolIndex]) {
          if (typeof viewerFields[protocolName] !== 'object') {
            viewerFields[protocolName] = {}
          }
          // avoid overwriting fields that return the same data:
          if (name in viewerFields[protocolName]) {
            name = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
          }
          viewerFields[protocolName][name] = field
        }
      }
    } else {
      // avoid overwriting fields that return the same data:
      if (name in rootQueryFields) {
        name = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
      }
      rootQueryFields[name] = field
    }

  // CASE: mutation
  } else {
    // use operationId to avoid problems differentiating between post, put,
    // patch, and delete of the same object
    let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)

    if (isAuthenticated) {
      for (let protocolIndex in operation.securityProtocols) {
        for (let protocolName in operation.securityProtocols[protocolIndex]) {
          if (typeof viewerMutationFields[protocolName] !== 'object') {
            viewerMutationFields[protocolName] = {}
          }
          viewerMutationFields[protocolName][saneName] = field
        }
      }
    } else {
      rootMutationFields[saneName] = field
    }
  }
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
  // create OT if needed:
  let type = SchemaBuilder.getGraphQLType({
    name: operation.resDef.otName,
    schema: operation.resDef.schema,
    data,
    operation,
    links: operation.links,
    oas
  })

  // determine resolve function:
  let reqSchemaName = (operation.reqDef ? operation.reqDef.iotName : null)
  let reqSchema = (operation.reqDef ? operation.reqDef.schema : null)
  let resolve = ResolverBuilder.getResolver({
    operation,
    oas,
    payloadName: reqSchemaName,
    data
  })

  // determine args:
  let args = SchemaBuilder.getArgs({
    parameters: operation.parameters,
    reqSchemaName: reqSchemaName,
    reqSchema,
    oas,
    data,
    reqRequired: operation.reqRequired
  })

  return {
    type,
    resolve,
    args,
    description: operation.description
  }
}

module.exports = {
  createGraphQlSchema
}
