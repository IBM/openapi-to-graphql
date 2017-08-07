/* @flow */

'use strict'

import type {Oas3, SchemaObject} from './types/oas3.js'
import type {Options} from './types/options.js'
import type {PreprocessingData} from './types/preprocessing_data.js'
import type {Operation, DataDefinition} from './types/operation.js'

import Oas3Tools from './oas_3_tools.js'
import deepEqual from 'deep-equal'
import debug from 'debug'
const log = debug('preprocessing')

/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OASGraph to use
 */
const preprocessOas = (oas: Oas3, options: Options) : PreprocessingData => {
  let data = {
    usedOTNames: [],
    defs: [],
    operations: {},
    saneMap: {},
    security: {},
    options
  }

  // Security schemas
  data.security = getProcessedSecuritySchemes(oas, options)

  // Process all operations
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      //  Only consider Operation Objects
      if (!Oas3Tools.isOperation(method)) {
        continue
      }

      let endpoint = oas.paths[path][method]

      // Determine description
      let description = endpoint.description
      if ((typeof description !== 'string' || description === '') &&
        typeof endpoint.summary === 'string') {
        description = endpoint.summary
      }
      if (typeof description !== 'string') {
        description = 'No description available.'
      }

      // Hold on to the operationId
      let operationId = endpoint.operationId

      // Fill in possibly missing operationId
      if (typeof operationId === 'undefined') {
        operationId = ((Oas3Tools.beautify(`${method}:${path}`) : any) : string)
      }

      // Request schema
      let {reqSchema, reqSchemaNames, reqRequired} = Oas3Tools.getReqSchemaAndNames(
        path, method, oas)

      let reqDef = createOrReuseDataDef(reqSchema, reqSchemaNames, data)

      // Response schema
      let {resSchema, resSchemaNames} = Oas3Tools.getResSchemaAndNames(
        path, method, oas)

      if (!resSchema || typeof resSchema !== 'object') {
        log(`Warning: "${method.toUpperCase()} ${path}" has no valid ` +
          `response schema. Ignore operation.`)
        continue
      }

      let resDef = createOrReuseDataDef(resSchema, resSchemaNames, data)

      // Links
      let links = Oas3Tools.getEndpointLinks(path, method, oas)

      // Parameters
      let parameters = Oas3Tools.getParameters(path, method, oas)

      // Security protocols
      let securityRequirements = []
      if (options.viewer) {
        securityRequirements = Oas3Tools.getSecurityRequirements(
          path, method, data.security, oas)
      }

      // Store determined information for operation
      let operation: Operation = {
        operationId,
        description,
        path,
        method: method.toLowerCase(),
        reqDef,
        reqRequired,
        resDef,
        links,
        parameters,
        securityRequirements
      }
      data.operations[operationId] = operation
    }
  }

  /**
   * SubOperation option
   * Determine "links" based on sub-paths
   * (Only now, when operations have been defined)
   */
  if (data.options.addSubOperations) {
    for (let operationIndex in data.operations) {
      let operation = data.operations[operationIndex]
      operation.subOps = getSubOps(operation, data.operations)
    }
  }

  return data
}

/**
 * Extracts the security schemes from given OAS and organizes the information in
 * a data structure that is easier for OASGraph to use
 *
 * Here is the structure of the data:
 * {
 *   {String} [beautified name] { Contains information about the security protocol
 *     {String} rawName           Stores the raw security protocol name
 *     {Object} def               Definition provided by OAS
 *     {Object} parameters        Stores the names of the authentication credentials
 *                                  NOTE: Structure will depend on the type of the protocol
 *                                    (e.g. basic authentication, API key, etc.)
 *                                  NOTE: Mainly used for the AnyAuth viewers
 *     {Object} schema            Stores the GraphQL schema to create the viewers
 *   }
 * }
 *
 * Here is an example:
 * {
 *   MyApiKey: {
 *     rawName: "My_api_key",
 *     def: { ... },
 *     parameters: {
 *       apiKey: MyKeyApiKey
 *     },
 *     schema: { ... }
 *   }
 *   MyBasicAuth: {
 *     rawName: "My_basic_auth",
 *     def: { ... },
 *     parameters: {
 *       username: MyBasicAuthUsername,
 *       password: MyBasicAuthPassword,
 *     },
 *     schema: { ... }
 *   }
 * }
 *
 * @param  {Object} oas Raw OpenAPI Specification 3.0.x
 *
 * @return {Object}     Extracted security definitions (see above)
 */
const getProcessedSecuritySchemes = (oas, options) => {
  let result = {}
  let security = Oas3Tools.getSecuritySchemes(oas)

  // Loop through all the security protocols
  for (let protocolKey in security) {
    let protocol = security[protocolKey]

    // OASGraph uses separate mechanisms to handle OAuth 2.0 (see the tokenJSONpath option)
    if (protocol.type === 'oauth2') {
      continue
    }

    let schema
    // Determine the parameters and the schema for the security protocol
    let parameters = {}
    switch (protocol.type) {
      case ('apiKey'):
        parameters = {
          apiKey: Oas3Tools.beautify(`${protocolKey}_apiKey`)
        }
        schema = {
          type: 'object',
          description: `API key credentials for the protocol '${protocolKey}'`,
          properties: {
            apiKey: {
              type: 'string'
            }
          }
        }
        break

      case ('http'):
        switch (protocol.scheme) {
          // HTTP a number of authentication types (see http://www.iana.org/assignments/http-authschemes/http-authschemes.xhtml)
          case ('basic'):
            parameters = {
              username: Oas3Tools.beautify(`${protocolKey}_username`),
              password: Oas3Tools.beautify(`${protocolKey}_password`)
            }
            schema = {
              type: 'object',
              description: `Basic auth credentials for the protocol '${protocolKey}'`,
              properties: {
                username: {
                  type: 'string'
                },
                password: {
                  type: 'string'
                }
              }
            }
            break
          default:
            if (options.strict) {
              throw new Error(`OASgraph currently does not support the HTTP authentication scheme '${protocol.scheme}'`)
            }
            log(`OASgraph currently does not support the HTTP authentication scheme '${protocol.scheme}'`)
        }
        break

      // TODO: Implement
      case ('openIdConnect'):
        break

      default:
        if (options.strict) {
          throw new Error(`OASgraph currently does not support the HTTP authentication scheme '${protocol.scheme}'`)
        }
        log(`OASgraph currently does not support the HTTP authentication scheme '${protocol.scheme}'`)
    }

    // Add protocol data to the output
    result[Oas3Tools.beautify(protocolKey)] = {
      rawName: protocolKey,
      def: protocol,
      parameters,
      schema
    }
  }
  return result
}

/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for Object Types), and an iotName
 * (= String to use as the name for Input Object Types). Eventually, data
 * definitions also hold an ot (= the Object Type for the schema) and an iot
 * (= the Input Object Type for the schema).
 *
 * Here is the structure of the output:
 * {
 *   {Object} schema  JSON schema
 *   {String} otName  A potential name for a GraphQL Object Type with this JSON schema
 *   {String} iotName A potential name for a GraphQL Input Object Type with this JSON schema
 * }
 *
 * NOTE: The data definition will contain an ot GraphQL Object Type and/or an iot GraphQL
 * Input Object Type down the pipeline
 */
const createOrReuseDataDef = (schema: SchemaObject, names, data: DataDefinition) => {
  // Do a basic validation check
  if (typeof schema === 'undefined') {
    return null
  }

  // Determine the index of possible existing data definition
  let index = getSchemaIndex(schema, data.defs)
  if (index !== -1) {
    return data.defs[index]
  }

  // Else, define a new name, store the def, and return it
  let name = getSchemaName(names, data)

  let def = {
    schema,
    otName: name,
    iotName: name + 'Input'
  }

  // Add the def to the master list
  data.defs.push(def)

  return def
}

/**
 * Determines the index of the data definition object that contains the same
 * schema as the given one
 *
 * @param  {Object} schema   JSON schema
 * @param  {Array}  dataDefs List of data definition objects
 *                             NOTE: Usually refers to data.defs, the master list of defs
 *
 * @return {Number}          Index of the data definition object or -1
 */
const getSchemaIndex = (schema, dataDefs) => {
  for (let defIndex in dataDefs) {
    if (deepEqual(schema, dataDefs[defIndex].schema)) {
      return defIndex
    }
  }
  // If the schema could not be found in the master list
  return -1
}

/**
 * Determines name to use for schema from previously determined schemaNames
 *
 * @param  {Object} names Contains fromRef, fromSchema, fromPath
 * @param  {Object} data  Result of preprocessing
 *
 * @return {String}       Determined name for the schema
 */
const getSchemaName = (names, data) => {
  if (typeof names === 'undefined') {
    throw new Error(`Cannot create data definition without name(s).`)
  }

  let schemaName

  // CASE: name from reference
  if (typeof names.fromRef === 'string') {
    let saneName = Oas3Tools.beautify(names.fromRef)
    if (!data.usedOTNames.includes(saneName)) {
      schemaName = names.fromRef
    }
  }

  // CASE: name from schema (i.e., "title" property in schema)
  if (!schemaName && typeof names.fromSchema === 'string') {
    let saneName = Oas3Tools.beautify(names.fromSchema)
    if (!data.usedOTNames.includes(saneName)) {
      schemaName = names.fromSchema
    }
  }

  // CASE: name from path
  if (!schemaName && typeof names.fromPath === 'string') {
    let saneName = Oas3Tools.beautify(names.fromPath)
    if (!data.usedOTNames.includes(saneName)) {
      schemaName = names.fromPath
    }
  }

  // CASE: create approximate name
  if (!schemaName) {
    let tempName = Oas3Tools.beautify(typeof names.fromRef === 'string' ? names.fromRef : (
      typeof names.fromSchema === 'string' ? names.fromSchema : names.fromPath))
    let appendix = 2

    /**
     * GraphQL Objects cannot share the name so if the name already exists in the master list
     * append an incremental number until the name does not exist anymore
     */
    while (data.usedOTNames.includes(`${tempName}${appendix}`)) {
      appendix++
    }
    schemaName = `${tempName}${appendix}`
  }

  // Store and beautify the name
  let saneName = Oas3Tools.beautifyAndStore(schemaName, data.saneMap)

  // Add the name to the master list
  data.usedOTNames.push(saneName)

  return saneName
}

/**
 * Returns an array of operations whose path contains the path of the given
 * operation. E.g., output could be an array with an operation having a path
 * '/users/{id}/profile' for a given operation with a path of '/users/{id}'.
 * Sub operations are only returned if the path of the given operation contains
 * at least one path parameter.
 */
const getSubOps = (
  operation: Operation,
  operations: {[string]: Operation}
) : Operation[] => {
  let subOps = []
  let hasPathParams = /\{.*\}/g.test(operation.path)
  if (!hasPathParams) return subOps

  for (let operationIndex in operations) {
    let subOp = operations[operationIndex]
    if (subOp.method === 'get' && operation.method === 'get' &&
      subOp.operationId !== operation.operationId &&
      subOp.path.includes(operation.path)) {
      subOps.push(subOp)
    }
  }
  return subOps
}

module.exports = {
  preprocessOas,
  createOrReuseDataDef
}
