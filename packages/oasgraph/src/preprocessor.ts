// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// Type imports:
import { Oas3, SchemaObject } from './types/oas3'
import { Options } from './types/options'
import { Operation, DataDefinition } from './types/operation'
import {
  PreprocessingData,
  ProcessedSecurityScheme
} from './types/preprocessing_data'

// Type definitions & exports:

// Imports:
import * as Oas3Tools from './oas_3_tools'
import * as deepEqual from 'deep-equal'
import debug from 'debug'
import { handleWarning } from './utils'

const log = debug('preprocessing')

/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OASGraph to use
 */
export function preprocessOas (
  oas: Oas3,
  options: Options
): PreprocessingData {
  let data = {
    usedOTNames: [
      'query', // used by OASGraph for root-level element
      'mutation' // used by OASGraph for root-level element
    ],
    defs: [],
    operations: {},
    saneMap: {},
    security: {},
    options
  }
  // store initial stats on OAS:
  data.options.report.numOps = Oas3Tools.countOperations(oas)
  data.options.report.numOpsMutation = Oas3Tools.countOperationsMutation(oas)
  data.options.report.numOpsQuery = Oas3Tools.countOperationsQuery(oas)

  // Security schemas
  data.security = getProcessedSecuritySchemes(oas, data)

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

      description += `\n\nEquivalent to ${method.toUpperCase()} ${path}`

      // Hold on to the operationId
      let operationId = endpoint.operationId

      // Fill in possibly missing operationId
      if (typeof operationId === 'undefined') {
        operationId = ((Oas3Tools.beautify(`${method}:${path}`) as any) as string)
      }

      // Request schema
      let { payloadContentType, payloadSchema, payloadSchemaNames, payloadRequired } =
        Oas3Tools.getRequestSchemaAndNames(path, method, oas)

      let payloadDefinition
      if (payloadSchema && typeof payloadSchema !== 'undefined') {
        payloadDefinition = createOrReuseDataDef(data, (payloadSchema as SchemaObject), payloadSchemaNames)
      }

      // Response schema
      let { responseContentType, responseSchema, responseSchemaNames } = Oas3Tools.getResponseSchemaAndNames(
        path, method, oas, data, options)

      if (!responseSchema || typeof responseSchema !== 'object') {
        handleWarning({
          typeKey: 'MISSING_RESPONSE_SCHEMA',
          culprit: `${method.toUpperCase()} ${path}`,
          data,
          log
        })
        continue
      }

      let responseDefinition = createOrReuseDataDef(
        data,
        (responseSchema as SchemaObject),
        responseSchemaNames
      )

      // Links
      let links = Oas3Tools.getEndpointLinks(
        path, method, oas, data)

      // Parameters
      let parameters = Oas3Tools.getParameters(path, method, oas)

      // Security protocols
      let securityRequirements = []
      if (options.viewer) {
        securityRequirements = Oas3Tools.getSecurityRequirements(
          path, method, data.security, oas)
      }

      // servers
      let servers = Oas3Tools.getServers(path, method, oas)

      // whether to place this operation into an authentication viewer
      let inViewer = securityRequirements.length > 0 &&
        data.options.viewer !== false

      let isMutation = method.toLowerCase() !== 'get'

      // Store determined information for operation
      let operation: Operation = {
        operationId,
        description,
        path,
        method: method.toLowerCase(),
        payloadContentType,
        payloadDefinition,
        payloadRequired,
        responseContentType,
        responseDefinition,
        links,
        parameters,
        securityRequirements,
        servers,
        inViewer,
        isMutation
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
 */
function getProcessedSecuritySchemes (
  oas: Oas3,
  data: PreprocessingData
): {[key: string]: ProcessedSecurityScheme} {
  let result = {}
  let security = Oas3Tools.getSecuritySchemes(oas)

  // Loop through all the security protocols
  for (let key in security) {
    let protocol = security[key]

    // We use a separate mechanisms to handle OAuth 2.0:
    if (protocol.type === 'oauth2') {
      continue
    }

    let schema
    // Determine the parameters and the schema for the security protocol
    let parameters = {}
    switch (protocol.type) {
      case ('apiKey'):
        parameters = {
          apiKey: Oas3Tools.beautify(`${key}_apiKey`)
        }
        schema = {
          type: 'object',
          description: `API key credentials for the protocol '${key}'`,
          properties: {
            apiKey: {
              type: 'string'
            }
          }
        }
        break

      case ('http'):
        switch (protocol.scheme) {
          // HTTP a number of authentication types (see
          // http://www.iana.org/assignments/http-authschemes/
          // http-authschemes.xhtml)
          case ('basic'):
            parameters = {
              username: Oas3Tools.beautify(`${key}_username`),
              password: Oas3Tools.beautify(`${key}_password`)
            }
            schema = {
              type: 'object',
              description: `Basic auth credentials for protocol '${key}'`,
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
            handleWarning({
              typeKey: 'UNSUPPORTED_HTTP_AUTH_SCHEME',
              culprit: `${String(protocol.scheme)}`,
              data,
              log
            })
        }
        break

      // TODO: Implement
      case ('openIdConnect'):
        break

      default:
        handleWarning({
          typeKey: 'UNSUPPORTED_HTTP_AUTH_SCHEME',
          culprit: `${String(protocol.scheme)}`,
          data,
          log
        })
    }

    // Add protocol data to the output
    result[key] = {
      rawName: key,
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
 */
export function createOrReuseDataDef (
  data: PreprocessingData,
  schema?: SchemaObject,
  names?: Oas3Tools.SchemaNames
): DataDefinition {
  // Do a basic validation check
  if (!schema || typeof schema === 'undefined') {
    throw new Error(`Cannot create data definition for invalid schema ` +
      `"${String(schema)}"`)
  }

  let preferredName = getPreferredName(data.usedOTNames, names)

  // Determine the index of possible existing data definition
  let index = getSchemaIndex(preferredName, schema, data.defs)
  if (index !== -1) {
    return data.defs[index]
  }

  // Else, define a new name, store the def, and return it
  let name = getSchemaName(data.usedOTNames, names)

  // Store and beautify the name
  let saneName = Oas3Tools.beautifyAndStore(name, data.saneMap)
  let saneInputName = saneName + 'Input'

  // Add the names to the master list
  data.usedOTNames.push(saneName)
  data.usedOTNames.push(saneInputName)

  let def = {
    schema,
    preferredName,
    otName: saneName,
    iotName: saneInputName
  }

  // Add the def to the master list
  data.defs.push(def)

  return def
}

/**
 * Returns the index of the data definition object in the given list that
 * contains the same schema and preferred name as the given one. Returns -1 if 
 * that schema could not be found.
 */
function getSchemaIndex (
  preferredName: string,
  schema: SchemaObject,
  dataDefs: DataDefinition[]
): number {
  let index = -1
  for (let def of dataDefs) {
    index++

    if (def.preferredName === preferredName && deepEqual(schema, def.schema)) {
      return index
    }
  }

  // If the schema could not be found in the master list
  return -1
}

/**
 * Determines the preferred name to use for schema regardless of name collisions.
 * 
 * In other words, determines the ideal name for a schema.
 * 
 * Similar to getSchemaName() except it does not check if the name has already 
 * been taken.
 */
function getPreferredName (
  usedNames: string[],
  names?: Oas3Tools.SchemaNames
): string {
  let schemaName

  // CASE: name from reference
  if (typeof names.fromRef === 'string') {
    schemaName = names.fromRef

  // CASE: name from schema (i.e., "title" property in schema)
  } else if (typeof names.fromSchema === 'string') {
    schemaName = names.fromSchema

  // CASE: name from path
  } else if (typeof names.fromPath === 'string') {
    schemaName = names.fromPath

  } else {
    let tempName = 'RandomName'

    let appendix = 2

    /**
     * GraphQL Objects cannot share the name so if the name already exists in
     * the master list append an incremental number until the name does not
     * exist anymore.
     */
    while (usedNames.includes(`${tempName}${appendix}`)) {
      appendix++
    }

    schemaName = `${tempName}${appendix}`
  }

  return Oas3Tools.beautify(schemaName)
}

/**
 * Determines name to use for schema from previously determined schemaNames and
 * considering not reusing existing names.
 */
function getSchemaName (
  usedNames: string[],
  names?: Oas3Tools.SchemaNames
): string {
  if (!names || typeof names === 'undefined') {
    throw new Error(`Cannot create data definition without name(s).`)
  }

  let schemaName

  // CASE: name from reference
  if (typeof names.fromRef === 'string') {
    let saneName = Oas3Tools.beautify(names.fromRef)
    if (!usedNames.includes(saneName)) {
      schemaName = names.fromRef
    }
  }

  // CASE: name from schema (i.e., "title" property in schema)
  if (!schemaName && typeof names.fromSchema === 'string') {
    let saneName = Oas3Tools.beautify(names.fromSchema)
    if (!usedNames.includes(saneName)) {
      schemaName = names.fromSchema
    }
  }

  // CASE: name from path
  if (!schemaName && typeof names.fromPath === 'string') {
    let saneName = Oas3Tools.beautify(names.fromPath)
    if (!usedNames.includes(saneName)) {
      schemaName = names.fromPath
    }
  }

  // CASE: all names are already used - create approximate name
  if (!schemaName) {
    let tempName = Oas3Tools.beautify(typeof names.fromRef === 'string'
      ? names.fromRef : (typeof names.fromSchema === 'string'
      ? names.fromSchema : (typeof names.fromPath === 'string'
      ? names.fromPath : 'RandomName')))
    let appendix = 2

    /**
     * GraphQL Objects cannot share the name so if the name already exists in
     * the master list append an incremental number until the name does not
     * exist anymore.
     */
    while (usedNames.includes(`${tempName}${appendix}`)) {
      appendix++
    }
    schemaName = `${tempName}${appendix}`
  }

  return schemaName
}

/**
 * Returns an array of operations whose path contains the path of the given
 * operation. E.g., output could be an array with an operation having a path
 * '/users/{id}/profile' for a given operation with a path of '/users/{id}'.
 * Sub operations are only returned if the path of the given operation contains
 * at least one path parameter.
 */
function getSubOps (
  operation: Operation,
  operations: {[key: string]: Operation}
): Operation[] {
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
