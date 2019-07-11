// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Defines the functions exposed by OpenAPI-to-GraphQL.
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
 * - To pass data between resolve functions, OpenAPI-to-GraphQL uses a _openapiToGraphql object
 *   returned by every resolver in addition to its original data (OpenAPI-to-GraphQL does
 *   not use the context to do so, which is an anti-pattern according to=
 *   https://github.com/graphql/graphql-js/issues/953).
 *
 * - OpenAPI-to-GraphQL can handle basic authentication and api key-based authentication
 *   through GraphQL. To do this, OpenAPI-to-GraphQL creates two new intermediate Object
 *   Types called QueryViewer and MutationViewer that take as input security
 *   credentials and pass them on using the _openapiToGraphql object to other resolve
 *   functions.
 */

// Type imports:
import { Options, InternalOptions, Report } from './types/options'
import { Oas3 } from './types/oas3'
import { Oas2 } from './types/oas2'
import { Args, Field, GraphQLType } from './types/graphql'
import { Operation } from './types/operation'
import { PreprocessingData } from './types/preprocessing_data'
import { GraphQLSchema, GraphQLObjectType } from 'graphql'
import * as NodeRequest from 'request'

// Imports:
import { getGraphQLType, getArgs } from './schema_builder'
import { getResolver } from './resolver_builder'
import * as GraphQLTools from './graphql_tools'
import { preprocessOas } from './preprocessor'
import * as Oas3Tools from './oas_3_tools'
import { createAndLoadViewer } from './auth_builder'
import debug from 'debug'
import { GraphQLSchemaConfig } from 'graphql/type/schema'
import { sortObject, handleWarning } from './utils'

type Result = {
  schema: GraphQLSchema
  report: Report
}

const translationLog = debug('translation')

/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
export async function createGraphQlSchema(
  spec: Oas3 | Oas2 | (Oas3 | Oas2)[],
  options?: Options
): Promise<Result> {
  if (typeof options === 'undefined') {
    options = {}
  }

  // Setting default options
  options.strict = typeof options.strict === 'boolean' ? options.strict : false

  // Schema options
  options.operationIdFieldNames =
    typeof options.operationIdFieldNames === 'boolean'
      ? options.operationIdFieldNames
      : false
  options.fillEmptyResponses =
    typeof options.fillEmptyResponses === 'boolean'
      ? options.fillEmptyResponses
      : false
  options.addLimitArgument =
    typeof options.addLimitArgument === 'boolean'
      ? options.addLimitArgument
      : false

  // Authentication options
  options.viewer = typeof options.viewer === 'boolean' ? options.viewer : true
  options.sendOAuthTokenInQuery =
    typeof options.sendOAuthTokenInQuery === 'boolean'
      ? options.sendOAuthTokenInQuery
      : false

  // Logging options
  options.provideErrorExtensions =
    typeof options.provideErrorExtensions === 'boolean'
      ? options.provideErrorExtensions
      : true
  options.equivalentToMessages =
    typeof options.equivalentToMessages === 'boolean'
      ? options.equivalentToMessages
      : true

  options['report'] = {
    warnings: [],
    numOps: 0,
    numOpsQuery: 0,
    numOpsMutation: 0,
    numQueriesCreated: 0,
    numMutationsCreated: 0
  }

  let oass: Oas3[]

  if (Array.isArray(spec)) {
    /**
     * Convert all non-OAS 3.0.x into OAS 3.0.x
     */
    oass = await Promise.all(
      spec.map(ele => {
        return Oas3Tools.getValidOAS3(ele)
      })
    )
  } else {
    /**
     * Check if the spec is a valid OAS 3.0.x
     * If the spec is OAS 2.0, attempt to translate it into 3.0.x, then try to
     * translate the spec into a GraphQL schema
     */
    oass = [await Oas3Tools.getValidOAS3(spec)]
  }

  const { schema, report } = await translateOpenApiToGraphQL(
    oass,
    options as InternalOptions
  )
  return {
    schema,
    report
  }
}

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 */
async function translateOpenApiToGraphQL(
  oass: Oas3[],
  {
    strict,
    report,

    // Schema options
    operationIdFieldNames,
    fillEmptyResponses,
    addLimitArgument,

    // Resolver options
    headers,
    qs,
    requestOptions,
    baseUrl,
    customResolvers,

    // Authentication options
    viewer,
    tokenJSONpath,
    sendOAuthTokenInQuery,

    // Logging options
    provideErrorExtensions,
    equivalentToMessages
  }: InternalOptions
): Promise<{ schema: GraphQLSchema; report: Report }> {
  const options = {
    strict,
    report,

    // Schema options
    operationIdFieldNames,
    fillEmptyResponses,
    addLimitArgument,

    // Resolver options
    headers,
    qs,
    requestOptions,
    baseUrl,
    customResolvers,

    // Authentication options
    viewer,
    tokenJSONpath,
    sendOAuthTokenInQuery,

    // Logging options
    provideErrorExtensions,
    equivalentToMessages
  }
  translationLog(`Options: ${JSON.stringify(options)}`)

  /**
   * Extract information from the OASs and put it inside a data structure that
   * is easier for OpenAPI-to-GraphQL to use
   */
  const data: PreprocessingData = preprocessOas(oass, options)

  preliminaryChecks(options, data)

  /**
   * Create GraphQL fields for every operation and structure them based on their
   * characteristics (query vs. mutation, auth vs. non-auth).
   */
  let queryFields = {}
  let mutationFields = {}
  let authQueryFields = {}
  let authMutationFields = {}
  Object.entries(data.operations)
    /**
     * Start with operations that return objects rather than arrays
     *
     * First, build up the GraphQL object so that operations that return arrays
     * can use them
     */
    .sort(([op1Id, op1], [op2Id, op2]) => sortOperations(op1, op2))
    .forEach(([operationId, operation]) => {
      translationLog(`Process operation '${operationId}'...`)

      let field = getFieldForOperation(
        operation,
        options.baseUrl,
        data,
        requestOptions
      )

      if (!operation.isMutation) {
        let fieldName = Oas3Tools.uncapitalize(
          operation.responseDefinition.otName
        )
        if (operation.inViewer) {
          for (let securityRequirement of operation.securityRequirements) {
            if (typeof authQueryFields[securityRequirement] !== 'object') {
              authQueryFields[securityRequirement] = {}
            }
            // Avoid overwriting fields that return the same data:
            if (
              fieldName in authQueryFields[securityRequirement] ||
              /**
               * If the option is set operationIdFieldNames, the fieldName is
               * forced to be the operationId
               */
              operationIdFieldNames
            ) {
              fieldName = Oas3Tools.sanitizeAndStore(operationId, data.saneMap)
            }

            if (fieldName in authQueryFields[securityRequirement]) {
              handleWarning({
                typeKey: 'DUPLICATE_FIELD_NAME',
                message:
                  `Multiple operations have the same name ` +
                  `'${fieldName}' and security requirement ` +
                  `'${securityRequirement}'. GraphQL field names must be ` +
                  `unique so only one can be added to the authentication ` +
                  `viewer. Operation '${operation.operationString}' will be ignored.`,
                data,
                log: translationLog
              })
            } else {
              authQueryFields[securityRequirement][fieldName] = field
            }
          }
        } else {
          // Avoid overwriting fields that return the same data:
          if (
            fieldName in queryFields ||
            /**
             * If the option is set operationIdFieldNames, the fieldName is
             * forced to be the operationId
             */
            operationIdFieldNames
          ) {
            fieldName = Oas3Tools.sanitizeAndStore(operationId, data.saneMap)
          }

          if (fieldName in queryFields) {
            handleWarning({
              typeKey: 'DUPLICATE_FIELD_NAME',
              message:
                `Multiple operations have the same name ` +
                `'${fieldName}'. GraphQL field names must be ` +
                `unique so only one can be added to the Query object. ` +
                `Operation '${operation.operationString}' will be ignored.`,
              data,
              log: translationLog
            })
          } else {
            queryFields[fieldName] = field
          }
        }
      } else {
        /**
         * Use operationId to avoid problems differentiating operations with the
         * same path but differnet methods
         */
        let saneFieldName = Oas3Tools.sanitizeAndStore(
          operationId,
          data.saneMap
        )
        if (operation.inViewer) {
          for (let securityRequirement of operation.securityRequirements) {
            if (typeof authMutationFields[securityRequirement] !== 'object') {
              authMutationFields[securityRequirement] = {}
            }

            if (saneFieldName in authMutationFields[securityRequirement]) {
              handleWarning({
                typeKey: 'DUPLICATE_FIELD_NAME',
                message:
                  `Multiple operations have the same name ` +
                  `'${saneFieldName}' and security requirement ` +
                  `'${securityRequirement}'. GraphQL field names must be ` +
                  `unique so only one can be added to the authentication ` +
                  `viewer. Operation '${operation.operationString}' will be ignored.`,
                data,
                log: translationLog
              })
            } else {
              authMutationFields[securityRequirement][saneFieldName] = field
            }
          }
        } else {
          if (saneFieldName in mutationFields) {
            handleWarning({
              typeKey: 'DUPLICATE_FIELD_NAME',
              message:
                `Multiple operations have the same name ` +
                `'${saneFieldName}'. GraphQL field names must be ` +
                `unique so only one can be added to the Mutation object. ` +
                `Operation '${operation.operationString}' will be ignored.`,
              data,
              log: translationLog
            })
          } else {
            mutationFields[saneFieldName] = field
          }
        }
      }
    })

  // Sorting fields
  queryFields = sortObject(queryFields)
  mutationFields = sortObject(mutationFields)
  authQueryFields = sortObject(authQueryFields)
  Object.keys(authQueryFields).forEach(key => {
    authQueryFields[key] = sortObject(authQueryFields[key])
  })
  authMutationFields = sortObject(authMutationFields)
  Object.keys(authMutationFields).forEach(key => {
    authMutationFields[key] = sortObject(authMutationFields[key])
  })

  /**
   * Count created queries / mutations
   */
  options.report.numQueriesCreated =
    Object.keys(queryFields).length +
    Object.keys(authQueryFields).reduce((sum, key) => {
      return sum + Object.keys(authQueryFields[key]).length
    }, 0)

  options.report.numMutationsCreated =
    Object.keys(mutationFields).length +
    Object.keys(authMutationFields).reduce((sum, key) => {
      return sum + Object.keys(authMutationFields[key]).length
    }, 0)

  /**
   * Organize created queries / mutations into viewer objects.
   */
  if (Object.keys(authQueryFields).length > 0) {
    Object.assign(
      queryFields,
      createAndLoadViewer(authQueryFields, data, false)
    )
  }

  if (Object.keys(authMutationFields).length > 0) {
    Object.assign(
      mutationFields,
      createAndLoadViewer(authMutationFields, data, true)
    )
  }

  /**
   * Build up the schema
   */
  const schemaConfig: GraphQLSchemaConfig = {
    query:
      Object.keys(queryFields).length > 0
        ? new GraphQLObjectType({
            name: 'Query',
            description: 'The start of any query',
            fields: queryFields
          })
        : GraphQLTools.getEmptyObjectType('query'),
    mutation:
      Object.keys(mutationFields).length > 0
        ? new GraphQLObjectType({
            name: 'Mutation',
            description: 'The start of any mutation',
            fields: mutationFields
          })
        : null
  }

  /**
   * Fill in yet undefined Object Types to avoid GraphQLSchema from breaking.
   *
   * The reason: once creating the schema, the 'fields' thunks will resolve and
   * if a field references an undefined Object Types, GraphQL will throw.
   */
  Object.entries(data.operations).forEach(([opId, operation]) => {
    if (typeof operation.responseDefinition.ot === 'undefined') {
      operation.responseDefinition.ot = GraphQLTools.getEmptyObjectType(
        operation.responseDefinition.otName
      )
    }
  })

  const schema = new GraphQLSchema(schemaConfig)

  return { schema, report: options.report }
}

/**
 * Creates the field object for the given operation.
 */
function getFieldForOperation(
  operation: Operation,
  baseUrl: string,
  data: PreprocessingData,
  requestOptions: NodeRequest.OptionsWithUrl
): Field {
  // Create GraphQL Type for response:
  const type = getGraphQLType({
    def: operation.responseDefinition,
    data,
    operation
  })

  // Create resolve function:
  const payloadSchemaName = operation.payloadDefinition
    ? operation.payloadDefinition.iotName
    : null

  const resolve = getResolver({
    operation,
    payloadName: payloadSchemaName,
    data,
    baseUrl,
    requestOptions
  })

  // Create args:
  const args: Args = getArgs({
    /**
     * Even though these arguments seems redundent because of the operation
     * argument, the function cannot be refactored because it is also used to
     * create arguments for links. The operation argument is really used to pass
     * data to other functions.
     */
    def: operation.payloadDefinition,
    parameters: operation.parameters,

    operation,
    data
  })

  return {
    type,
    resolve,
    args,
    description: operation.description
  }
}

/**
 * Helper function for sorting operations based on the return type and method
 *
 * You cannot define links for operations that return arrays in the OAS
 *
 * These links are instead created by reusing the return type from other
 * operations
 *
 * Therefore, operations that return objects should be created first
 *
 * In addition, process GET operations first because their field names are based
 * on the return type (so long as there are no naming collisions).
 */
function sortOperations(op1: Operation, op2: Operation): number {
  // Sort by object/array type
  if (
    op1.responseDefinition.schema.type === 'array' &&
    op2.responseDefinition.schema.type !== 'array'
  ) {
    return 1
  } else if (
    op1.responseDefinition.schema.type !== 'array' &&
    op2.responseDefinition.schema.type === 'array'
  ) {
    return -1
  } else {
    // Sort by GET/non-GET method
    if (op1.method === 'get' && op2.method !== 'get') {
      return -1
    } else if (op1.method !== 'get' && op2.method === 'get') {
      return 1
    } else {
      return 0
    }
  }
}

/**
 * Ensures that the options are valid
 */
function preliminaryChecks(
  options: InternalOptions,
  data: PreprocessingData
): void {
  // Check if OASs have unique titles
  const titles = data.oass.map(oas => {
    return oas.info.title
  })

  // Find duplicates among titles
  new Set(
    titles.filter((title, index) => {
      return titles.indexOf(title) !== index
    })
  ).forEach(title => {
    handleWarning({
      typeKey: 'MULTIPLE_OAS_SAME_TITLE',
      message: `Multiple OAS share the same title '${title}'`,
      data,
      log: translationLog
    })
  })

  // Check customResolvers
  if (typeof options.customResolvers === 'object') {
    // Check that all OASs that are referenced in the customResolvers are provided
    Object.keys(options.customResolvers)
      .filter(title => {
        // If no OAS contains this title
        return !data.oass.some(oas => {
          return title === oas.info.title
        })
      })
      .forEach(title => {
        handleWarning({
          typeKey: 'CUSTOM_RESOLVER_UNKNOWN_OAS',
          message:
            `Custom resolvers reference OAS '${title}' but no such ` +
            `OAS was provided`,
          data,
          log: translationLog
        })
      })

    // TODO: Only run the following test on OASs that exist. See previous check.
    Object.keys(options.customResolvers).forEach(title => {
      // Get all operations from a particular OAS
      const operations = Object.values(data.operations).filter(operation => {
        return title === operation.oas.info.title
      })

      Object.keys(options.customResolvers[title]).forEach(path => {
        Object.keys(options.customResolvers[title][path]).forEach(method => {
          if (
            !operations.some(operation => {
              return path === operation.path && method === operation.method
            })
          ) {
            handleWarning({
              typeKey: 'CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD',
              message:
                `A custom resolver references an operation with ` +
                `path '${path}' and method '${method}' but no such operation ` +
                `exists in OAS '${title}'`,
              data,
              log: translationLog
            })
          }
        })
      })
    })
  }
}

export { sanitize } from './oas_3_tools'
