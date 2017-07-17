'use strict'

const Oas3Tools = require('./oas_3_tools.js')
const deepEqual = require('deep-equal')
const log = require('debug')('preprocessing')

const preprocessOas = (oas, options) => {
  let data = {
    // stores (Input) Object Type names already used
    usedOTNames: [],
    // stores objects with unique JSON schema, names object, Object Type, and
    // Input Object Type
    defs: [],
    operations: {},
    saneMap: {},
    // stores, per protocol, the schema (= JSON schema for the Input Object
    // Type), rawName (of the protocol), def (= the OAS definition), and
    // parameters
    security: {},
    options
  }

  /**
   * Process all operations
   */
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      /**
       * Only consider Operation Objects
       */
      if (!Oas3Tools.isOperation(method)) {
        continue
      }

      let endpoint = oas.paths[path][method]

      /**
       * Fill in possibly missing operationId.
       */
      if (typeof endpoint.operationId === 'undefined') {
        endpoint.operationId = Oas3Tools.beautify(`${method}:${path}`)
      }

      /**
       * Hold on to operationId:
       */
      let operationId = endpoint.operationId

      /**
       * Request schema
       */
      let {reqSchema, reqSchemaNames, reqRequired} = Oas3Tools.getReqSchemaAndNames(
        path, method, oas)

      let reqDef = createOrReuseDataDef(reqSchema, reqSchemaNames, data)

      /**
       * Response schema
       */
      let {resSchema, resSchemaNames} = Oas3Tools.getResSchemaAndNames(
        path, method, oas)

      if (!resSchema || typeof resSchema !== 'object') {
        log(`Warning: "${method.toUpperCase()} ${path}" has no valid ` +
          `response schema. Ignore operation.`)
        continue
      }

      let resDef = createOrReuseDataDef(resSchema, resSchemaNames, data)

      /**
       * Links
       */
      let links = Oas3Tools.getEndpointLinks(path, method, oas)

      /**
       * Parameters
       */
      let parameters = Oas3Tools.getParameters(path, method, oas)

      /**
       * Security protocols
       */
      let securityProtocols = Oas3Tools.getSecurityProtocols(path, method, oas)

      // store determined information for operation:
      data.operations[operationId] = {
        path,
        method: method.toLowerCase(),
        reqDef,
        reqRequired,
        resDef,
        links,
        parameters,
        securityProtocols,
        operationId
      }
    }
  }

  /**
   * Determine "links" based on sub-paths
   * (Only now, when every operation is guaranteed to have an operationId)
   */
  if (data.options.addSubOperations) {
    for (let i in data.operations) {
      let operation = data.operations[i]
      operation.subOps = getSubOps(operation, data.operations)
    }
  }

  /**
   * Security schemas
   */
  data.security = getSecuritySchemes(oas, options)

  return data
}

/**
 * Returns an array of operations whose path contains the path of the given
 * operation. E.g., output could be an array with an operation having a path
 * '/users/{id}/profile' for a given operation with a path of '/users/{id}'.
 * Sub operations are only returned if the path of the given operation contains
 * at least one path parameter.
 *
 * @param  {Object} operation  Operation object created by preprocessing
 * @param  {Array} operations  List of operation objects
 * @return {Array}            List of operation objects
 */
const getSubOps = (operation, operations) => {
  let subOps = []
  let hasPathParams = /\{.*\}/g.test(operation.path)
  if (!hasPathParams) return subOps

  for (let i in operations) {
    let subOp = operations[i]
    if (subOp.method === 'get' && operation.method === 'get' &&
      subOp.operationId !== operation.operationId &&
      subOp.path.includes(operation.path)) {
      subOps.push(subOp)
    }
  }

  return subOps
}

/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for Object Types), and an iotName
 * (= String to use as the name for Input Object Types). Eventually, data
 * definitions also hold an ot (= the Object Type for the schema) and an iot
 * (= the Input Object Type for the schema).
 *
 * @param  {[type]} schema [description]
 * @param  {[type]} names  [description]
 * @param  {[type]} data   [description]
 * @return {[type]}        [description]
 */
const createOrReuseDataDef = (schema, names, data) => {
  // don't do anything without a valid schema:
  if (typeof schema === 'undefined') {
    return null
  }

  // determine index of possibly existing data definition:
  let index = getSchemaIndex(data.defs, schema)
  if (index !== -1) {
    return data.defs[index]
  }

  // ...else, lets define names, store the def, and return it:
  let name = getSchemaName(names, data)

  let def = {
    schema,
    otName: name,
    iotName: name + 'Input'
  }
  data.defs.push(def)

  return def
}

/**
 * Extracts all security schemes from given OAS. The resulting data looks like
 * this:
 *
 * {
 *    MyApiKey: {
 *      rawName: "My_api_key",
 *      def: {...},    // definition from oas.components.securitySchemes
 *      parameters: {  // mapping between beautified and distinctive param names
 *        apiKey: MyKey_apiKey
 *      }
 *    }
 *    MyBasicAuth: {
 *      rawName: "My_basic_auth",
 *      def: {...},
 *      parameters: {
 *        username: MyBasicAuth_username,
 *        password: MyBasicAuth_password,
 *      }
 *    }
 *  }
 *
 * @param  {Object} oas OpenAPI Specification 3.0.x
 * @return {Object}     Extracted security definitions (see above)
 */
const getSecuritySchemes = (oas, options) => {
  let security = {}

  for (let protocolName in oas.components.securitySchemes) {
    let protocol = oas.components.securitySchemes[protocolName]
    let schema
    // determine parameters for scheme:
    let parameters = {}
    switch (protocol.type) {
      case ('apiKey'):
        parameters = {
          apiKey: Oas3Tools.beautify(`${protocolName}_apiKey`)
        }
        schema = {
          type: 'object',
          description: `API key credentials for the protocol '${protocolName}'`,
          properties: {
            apiKey: {
              type: 'string'
            }
          }
        }
        break

      case ('http'):
        switch (protocol.scheme) {
          case ('basic'):
            parameters = {
              username: Oas3Tools.beautify(`${protocolName}_username`),
              password: Oas3Tools.beautify(`${protocolName}_password`)
            }
            schema = {
              type: 'object',
              description: `Basic auth credentials for the protocol '${protocolName}'`,
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

      case ('oauth2'):
        break

      case ('openIdConnect'):
        break

      default:
        if (options.strict) {
          throw new Error(`OASgraph currently does not support the HTTP authentication scheme '${protocol.scheme}'`)
        }
        log(`OASgraph currently does not support the HTTP authentication scheme '${protocol.scheme}'`)
    }

    // add protocol data:
    security[Oas3Tools.beautify(protocolName)] = {
      rawName: protocolName,
      def: protocol,
      parameters,
      schema
    }
  }
  return security
}

/**
 * Determines name to use for schema from previously determined schemaNames.
 *
 * @param  {Object} names       Contains fromRef, fromSchema, fromPath
 * @param  {Object} data        Result of preprocessing
 * @return {String}             Determined name for the schema
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
    while (data.usedOTNames.includes(`${tempName}${appendix}`)) {
      appendix++
    }
    schemaName = `${tempName}${appendix}`
  }

  // store beautification of name:
  let saneName = Oas3Tools.beautifyAndStore(schemaName, data.saneMap)

  // remember this name was used:
  data.usedOTNames.push(saneName)

  return saneName
}

/**
 * Determines the index of the data definition object that contains the same
 * schema as the given one.
 *
 * @param  {Array} dataDefs  List of data definition objects
 * @param  {Object} schema   JSON schema
 * @return {Number}          Index of the data definition object, or -1
 */
const getSchemaIndex = (dataDefs, schema) => {
  for (let i in dataDefs) {
    if (deepEqual(dataDefs[i].schema, schema)) {
      return i
    }
  }
  return -1
}

module.exports = {
  preprocessOas,
  createOrReuseDataDef
}
