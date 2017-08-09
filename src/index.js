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
import type { Options } from './types/options.js'
import type { Oas3 } from './types/oas3.js'
import type { Oas2 } from './types/oas2.js'
import type { Args } from './schema_builder.js'
import type { Operation } from './types/operation.js'
import type { ResolveFunction } from './resolver_builder.js'
import type { PreprocessingData } from './types/preprocessing_data.js'
import type {
  GraphQLSchema as GraphQLSchemaType,
  GraphQLObjectType as GQObjectType,
  GraphQLInputObjectType as GQInputObjectType,
  GraphQLScalarType,
  GraphQLList,
  GraphQLEnumType
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
  rootQueryFields: Object,
  rootMutationFields: Object,
  viewerFields: Object,
  viewerMutationFields: Object,
  data: PreprocessingData,
  oas: Oas3
}

// Imports:
import { getGraphQLType, getArgs } from './schema_builder.js'
import { getResolver } from './resolver_builder.js'
import * as GraphQLTools from './graphql_tools.js'
import { preprocessOas } from './preprocessor.js'
import * as Oas3Tools from './oas_3_tools.js'
import AuthBuilder from './auth_builder.js'
import debug from 'debug'
import {
  GraphQLSchema,
  GraphQLObjectType
} from 'graphql'

const log = debug('translation')

/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
function createGraphQlSchema (
  spec: Oas3 | Oas2,
  options: Options = {
    // some default values:
    strict: true,
    addSubOperations: true,
    viewer: true,
    sendOAuthTokenInQuery: false
  }
): Promise<GraphQLSchemaType> {
  return new Promise((resolve, reject) => {
    // Some basic validation
    if (typeof spec !== 'object') {
      throw new Error(`Invalid specification provided`)
    }

    /**
     * Check if the spec is a valid OAS 3.0.x
     * If the spec is OAS 2.0, attempt to translate it into 3.0.x, then try to
     * translate the spec into a GraphQL schema
     */
    Oas3Tools.getValidOAS3(spec)
      .then(oas => {
        translateOpenApiToGraphQL(oas, options)
          .then(resolve)
          .catch(reject)
      })
      .catch(reject)
  })
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
    sendOAuthTokenInQuery
  } : Options
) {
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
     * is easier for OASGraph to use
     */
    let data = preprocessOas(oas, options)

    /**
     * Holds on to the highest-level (entry-level) object types for queries that
     * are accessible in the schema to build
     */
    let rootQueryFields = {}

    /**
     * Holds on to the highest-level (entry-level) object types for mutations
     * that are accessible in the schema to build
     */
    let rootMutationFields = {}

    // Intermediate field used to input authentication credentials for queries
    let viewerFields = {}

    // Intermediate field used to input authentication credentials for mutations
    let viewerMutationFields = {}

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
        loadField({
          operation,
          operationId,
          rootQueryFields,
          rootMutationFields,
          viewerFields,
          viewerMutationFields,
          data,
          oas
        })
      }
    }

    // ...and again for endpoints without links
    for (let operationId in data.operations) {
      let operation = data.operations[operationId]
      if (Object.keys(operation.links).length === 0 &&
        (!Array.isArray(operation.subOps) || operation.subOps.length === 0)) {
        loadField({
          operation,
          operationId,
          rootQueryFields,
          rootMutationFields,
          viewerFields,
          viewerMutationFields,
          data,
          oas
        })
      }
    }

    const usedViewerNames = {} // remember used viewer names
    const usedMutationViewerNames = {} // remember used mutationViewer names

    // create and add viewer object types to the query and mutation object types
    // if applicable
    if (Object.keys(viewerFields).length > 0) {
      AuthBuilder.createAndLoadViewer(
        viewerFields,
        rootQueryFields,
        usedViewerNames,
        data,
        oas
      )
    }

    if (Object.keys(viewerMutationFields).length > 0) {
      AuthBuilder.createAndLoadViewer(
        viewerMutationFields,
        rootMutationFields,
        usedMutationViewerNames,
        data,
        oas,
        true
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
 * Generates a field for the given operation and stores it in the given field
 * objects (depending on whether the operation is a mutation, and on its
 * authentication requirements).
 */
function loadField ({
  operation,
  operationId,
  rootQueryFields,
  rootMutationFields,
  viewerFields,
  viewerMutationFields,
  data,
  oas
} : LoadFieldsParams) {
  // Get the fields for an operation
  let field = getFieldForOperation(operation, data, oas)

  // If the operation has no valid type, abort
  if (!field.type || typeof field.type === 'undefined') {
    log(`Warning: skipped operation "${operation.method.toUpperCase()} ` +
      `${operation.path}" without defined Object Type.`)
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
        if (typeof viewerFields[securityRequirement] !== 'object') {
          viewerFields[securityRequirement] = {}
        }
        // Avoid overwriting fields that return the same data:
        if (name in viewerFields[securityRequirement]) {
          name = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
        }
        viewerFields[securityRequirement][name] = field
      }
    } else {
      // Avoid overwriting fields that return the same data:
      if (name in rootQueryFields) {
        name = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
      }
      rootQueryFields[name] = field
    }

  // CASE: mutation
  } else {
    // Use operationId to avoid problems differentiating operations with the
    // same path but differnet methods
    let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)

    if (isAuthenticated) {
      for (let securityRequirement of operation.securityRequirements) {
        if (typeof viewerMutationFields[securityRequirement] !== 'object') {
          viewerMutationFields[securityRequirement] = {}
        }
        viewerMutationFields[securityRequirement][saneName] = field
      }
    } else {
      rootMutationFields[saneName] = field
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

  // craete resolve function:
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
