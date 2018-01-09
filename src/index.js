/* @flow */

'use strict'

/**
 * Defines the functions exposed by OASGraph.
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
 */

// Type imports:
import type { Options, Report } from './types/options.js'
import type { Oas3 } from './types/oas3.js'
import type { Oas2 } from './types/oas2.js'
import type { Args } from './schema_builder.js'
import type { Operation } from './types/operation.js'
import type { ResolveFunction } from './resolver_builder.js'
import type { PreprocessingData } from './types/preprocessing_data.js'
import type {
  GraphQLObjectType as GQObjectType,
  GraphQLInputObjectType as GQInputObjectType,
  GraphQLScalarType,
  GraphQLList,
  GraphQLEnumType
} from 'graphql'

// Imports:
import { getGraphQLType, getArgs } from './schema_builder.js'
import { getResolver } from './resolver_builder.js'
import * as GraphQLTools from './graphql_tools.js'
import { preprocessOas } from './preprocessor.js'
import * as Oas3Tools from './oas_3_tools.js'
import AuthBuilder from './auth_builder.js'
import debug from 'debug'
import { handleWarning } from './utils.js'
import {
  GraphQLSchema,
  GraphQLObjectType
} from 'graphql'

// Type definitions & exports:
type Viewer = {
  type: GQObjectType | GQInputObjectType | GraphQLScalarType |
    GraphQLList<any> | GraphQLEnumType,
  resolve: ResolveFunction,
  args: Args,
  description: string
}
type LoadFieldsParams = {
  operation: Operation,
  operationId: string,
  queryFields: Object,
  mutationFields: Object,
  authQueryFields: Object,
  authMutationFields: Object,
  data: PreprocessingData,
  oas: Oas3,
  options: Options
}
type Result = {
  schema: GraphQLSchema,
  report: Report
}

const log = debug('translation')

/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
async function createGraphQlSchema (
  spec: Oas3 | Oas2,
  options: Options
): Promise<Result> {
  // deal with option defaults:
  if (typeof options === 'undefined') options = {}
  options.strict = options.strict || false
  options.addSubOperations = options.addSubOperations || true
  options.viewer = options.viewer || true
  options.sendOAuthTokenInQuery = options.sendOAuthTokenInQuery || false
  options.report = {
    warnings: [],
    numOps: 0,
    numOpsQuery: 0,
    numOpsMutation: 0,
    numQueriesCreated: 0,
    numMutationsCreated: 0
  }

  /**
   * Check if the spec is a valid OAS 3.0.x
   * If the spec is OAS 2.0, attempt to translate it into 3.0.x, then try to
   * translate the spec into a GraphQL schema
   */
  let oas = await Oas3Tools.getValidOAS3(spec)
  let schema = await translateOpenApiToGraphQL(oas, options)
  return {
    schema,
    report: options.report
  }
}

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 */
function translateOpenApiToGraphQL (
  oas: Oas3,
  {
    strict,
    headers,
    qs,
    viewer,
    tokenJSONpath,
    addSubOperations,
    sendOAuthTokenInQuery,
    report
  } : Options
): Promise<GraphQLSchema> {
  return new Promise((resolve, reject) => {
    let options = {
      headers,
      qs,
      viewer,
      tokenJSONpath,
      strict,
      addSubOperations,
      sendOAuthTokenInQuery,
      report
    }
    log(`Options: ${JSON.stringify(options)}`)

    /**
     * Extract information from the OAS and put it inside a data structure that
     * is easier for OASGraph to use
     */
    let data = preprocessOas(oas, options)

    // holds unauthenticated query fields
    let queryFields = {}

    // holds unauthenticated mutation fields
    let mutationFields = {}

    // holds authenticated query fields
    let authQueryFields = {}

    // holds authenticated mutation fields
    let authMutationFields = {}

    /**
     * Translate every endpoint to GraphQL schemes.
     *
     * Do this first for endpoints that DO contain links OR that DO contain sub
     * operation, so that built up GraphQL object types that are reused contain
     * these links
     *
     * This necessitates a second iteration, though, for the endpoints that DO
     * NOT have links.
     */
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length > 0 ||
      (Array.isArray(operation.subOps) && operation.subOps.length > 0)) {
        log(`Process operation "${operation.operationId}"...`)
        loadField({
          operation,
          operationId,
          queryFields,
          mutationFields,
          authQueryFields,
          authMutationFields,
          data,
          oas,
          options
        })
      }
    }

    // ...and again for endpoints without links
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length === 0 &&
        (!Array.isArray(operation.subOps) || operation.subOps.length === 0)) {
        log(`Process operation "${operation.operationId}"...`)
        loadField({
          operation,
          operationId,
          queryFields,
          mutationFields,
          authQueryFields,
          authMutationFields,
          data,
          oas,
          options
        })
      }
    }

    /**
     * Count created queries / mutations
     */
    let numQueriesCreated = Object.keys(queryFields).length
    for (let key in authQueryFields) {
      numQueriesCreated += Object.keys(authQueryFields[key]).length
    }
    options.report.numQueriesCreated = numQueriesCreated

    let numMutationsCreated = Object.keys(mutationFields).length
    for (let key in authMutationFields) {
      numMutationsCreated += Object.keys(authMutationFields[key]).length
    }
    options.report.numMutationsCreated = numMutationsCreated

    /**
     * Organize created queries / mutations into viewer objects.
     */
    const rootQueryFields = Object.assign({}, queryFields)
    if (Object.keys(authQueryFields).length > 0) {
      const queryViewers = AuthBuilder.createAndLoadViewer(
        authQueryFields,
        data,
        oas,
        false
      )
      Object.assign(rootQueryFields, queryViewers)
    }

    const rootMutationFields = Object.assign({}, mutationFields)
    if (Object.keys(authMutationFields).length > 0) {
      const mutationViewers = AuthBuilder.createAndLoadViewer(
        authMutationFields,
        data,
        oas,
        true
      )
      Object.assign(rootMutationFields, mutationViewers)
    }

    /**
     * Build up the schema
     */
    let schemaDef = {}
    if (Object.keys(rootQueryFields).length > 0) {
      schemaDef.query = new GraphQLObjectType({
        name: 'query',
        description: 'The start of any query',
        fields: rootQueryFields
      })
    } else {
      schemaDef.query = GraphQLTools.getEmptyObjectType('query')
    }
    if (Object.keys(rootMutationFields).length > 0) {
      schemaDef.mutation = new GraphQLObjectType({
        name: 'mutation',
        description: 'The start of any mutation',
        fields: rootMutationFields
      })
    }

    // Fill in yet undefined Object Types to avoid GraphQLSchema from breaking.
    // The reason: once creating the schema, the 'fields' thunks will resolve
    // and if a field references an undefined Object Types, GraphQL will throw.
    for (let i in data.operations) {
      let operation = data.operations[i]
      if (typeof operation.resDef.ot === 'undefined') {
        operation.resDef.ot = GraphQLTools
          .getEmptyObjectType(operation.resDef.otName)
      }
    }

    let schema = new GraphQLSchema(schemaDef)

    resolve(schema)
  })
}

/**
 * Generates a field for the given operation and stores it in the given field
 * objects (depending on whether the operation is a mutation, and on its
 * authentication requirements).
 */
function loadField ({
  operation,
  operationId,
  queryFields,
  mutationFields,
  authQueryFields,
  authMutationFields,
  data,
  oas,
  options
} : LoadFieldsParams) {
  // Get the fields for an operation
  let field = getFieldForOperation(operation, data, oas)

  // If the operation has no valid type, abort
  if (!field.type || typeof field.type === 'undefined') {
    handleWarning({
      typeKey: 'MISSING_GRAPHQL_TYPE',
      culprit: `${operation.method.toUpperCase()} ${operation.path}`,
      data,
      log
    })
    return
  }

  // Determine if the operation is authenticated
  let isAuthenticated = operation.securityRequirements.length > 0 &&
    data.options.viewer !== false

  // CASE: query
  if (operation.method.toLowerCase() === 'get') {
    // Use name of the response data schema as field name:
    let name = operation.resDef.otName

    if (isAuthenticated) {
      for (let securityRequirement of operation.securityRequirements) {
        if (typeof authQueryFields[securityRequirement] !== 'object') {
          authQueryFields[securityRequirement] = {}
        }
        // Avoid overwriting fields that return the same data:
        if (name in authQueryFields[securityRequirement]) {
          name = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
        }
        authQueryFields[securityRequirement][name] = field
      }
    } else {
      // Avoid overwriting fields that return the same data:
      if (name in queryFields) {
        name = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
      }
      queryFields[name] = field
    }

  // CASE: mutation
  } else {
    // Use operationId to avoid problems differentiating operations with the
    // same path but differnet methods
    let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)

    if (isAuthenticated) {
      for (let securityRequirement of operation.securityRequirements) {
        if (typeof authMutationFields[securityRequirement] !== 'object') {
          authMutationFields[securityRequirement] = {}
        }
        authMutationFields[securityRequirement][saneName] = field
      }
    } else {
      mutationFields[saneName] = field
    }
  }
}

/**
 * Creates the field object for the given operation.
 */
function getFieldForOperation (
  operation: Operation,
  data: PreprocessingData,
  oas: Oas3
) : Viewer {
  // create OT returned by operation:
  let type = getGraphQLType({
    name: operation.resDef.otName,
    schema: operation.resDef.schema,
    data,
    operation,
    oas
  })

  // create resolve function:
  let reqSchemaName = (operation.reqDef ? operation.reqDef.iotName : null)
  let reqSchema = (operation.reqDef ? operation.reqDef.schema : null)
  let resolve = getResolver({
    operation,
    oas,
    payloadName: reqSchemaName,
    data
  })

  // create args:
  let args: Args = getArgs({
    parameters: operation.parameters,
    reqSchemaName: reqSchemaName,
    reqSchema,
    operation,
    data,
    oas
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
