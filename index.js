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

/*
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x.
 *
 * @param  {object} oas OpenAPI Specification 3.0
 * @return {promise}    Resolves on GraphQLSchema, rejects on error during
 * schema creation
 */
const translateOpenApiToGraphQL = (oas, {headers, qs, viewer, tokenJSONpath, strict}) => {
  return new Promise((resolve, reject) => {
    /**
     * Result of preprocessing OAS:
     *
     * {
     *  dataDefs            // list of data definitions (schema, names, ot, iot)
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
    let data = Preprocessor.preprocessOas(oas, strict)

    /**
     * Store options to data
     */
    data.options = {headers, qs, viewer, tokenJSONpath, strict}
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
     * Do this first for endpoints that DO contain links, so that built up
     * GraphQL object types that are reused contain these links.
     *
     * This necessitates a second iteration, though, for the endpoints that
     * DO NOT have links.
     */
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length > 0) {
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
      if (Object.keys(operation.links).length === 0) {
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
          if (data.security[protocolName].def.type === 'oauth2') {
            // avoid overwriting fields that return the same data:
            if (name in rootQueryFields) {
              name = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
            }
            rootQueryFields[name] = field
          } else {
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
          if (data.security[protocolName].def.type === 'oauth2') {
            rootMutationFields[saneName] = field
          } else {
            if (typeof viewerMutationFields[protocolName] !== 'object') {
              viewerMutationFields[protocolName] = {}
            }
            viewerMutationFields[protocolName][saneName] = field
          }
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
    args
  }
}

module.exports = {
  createGraphQlSchema
}
