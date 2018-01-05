/* @flow */

'use strict'

/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */

// Type imports:
import type { PreprocessingData } from './types/preprocessing_data.js'
import type { Operation, DataDefinition } from './types/operation.js'
import type { Oas3, SchemaObject, ParameterObject } from './types/oas3.js'
import type {
  GraphQLObjectType as GQObjectType,
  GraphQLScalarType,
  GraphQLInputObjectType as GQInputObjectType,
  GraphQLList as GQList,
  GraphQLEnumType as GQEnumType,
  Thunk,
  GraphQLFieldConfigMap
} from 'graphql'

// Imports:
import * as Oas3Tools from './oas_3_tools.js'
import { getResolver } from './resolver_builder.js'
import { createOrReuseDataDef } from './preprocessor.js'
import debug from 'debug'
import { handleWarning } from './utils.js'
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInputObjectType,
  GraphQLEnumType
} from 'graphql'

// Type definitions & exports:
type GetGraphQLParams = {
  name: string,              // name of type to create NOTE: ignored for scalars
  schema: SchemaObject,
  operation?: Operation,
  data: PreprocessingData,   // data produced by preprocessing
  oas: Oas3,                 // input OAS 3
  iteration?: number,        // count of recursions used to create type
  isMutation?: boolean       // whether to create an Input Type
}

type Arg = {
  type: any,
  description?: string
}

export type Args = {
  [string]: Arg
}

type GetArgsParams = {
  parameters: ParameterObject[],
  reqSchema?: ?SchemaObject,
  reqSchemaName?: ?string,
  data: PreprocessingData,
  oas: Oas3,
  operation?: Operation
}

type ReuseOrCreateOtParams = {
  name: string,
  schema: SchemaObject,
  operation?: Operation,
  data: PreprocessingData,
  oas: Oas3,
  iteration: number,
  isMutation: boolean
}

type ReuseOrCreateListParams = {
  name: string,
  operation?: Operation,
  schema: SchemaObject,
  data: PreprocessingData,
  oas: Oas3,
  iteration: number,
  isMutation: boolean
}

type ReuseOrCreateEnum = {
  name: string,
  data: PreprocessingData,
  enumList: Object
}

type CreateFieldsParams = {
  name: string,
  operation?: Operation,
  schema: SchemaObject,
  data: PreprocessingData,
  oas: Oas3,
  iteration: number,
  isMutation: boolean
}

type FieldsType = Thunk<GraphQLFieldConfigMap<Object, Object>>

const log = debug('translation')

/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
export function getGraphQLType ({
  name,
  schema,
  operation,
  data,
  oas,
  iteration = 0,
  isMutation = false
} : GetGraphQLParams
) : GQObjectType | GQInputObjectType | GraphQLScalarType | GQList<any> | GQEnumType {
  // avoid excessive iterations
  if (iteration === 20) {
    throw new Error(`Too many iterations when creating schema ${name}`)
  }

  // no valid schema name
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid schema name provided`)
  }

  // some error checking
  if (!schema || typeof schema !== 'object') {
    throw new Error(`Invalid schema for ${name} provided of type ` +
      `"${typeof schema}"`)
  }

  // resolve allOf element in schema if applicable
  if ('allOf' in schema) {
    schema = Oas3Tools.resolveAllOf(schema, oas)
  }

  // determine the type of the schema
  let type = Oas3Tools.getSchemaType(schema)

  // CASE: no known type
  if (!type) {
    handleWarning({
      typeKey: 'INVALID_SCHEMA_TYPE',
      culprit: JSON.stringify(schema),
      data,
      log
    })
    return GraphQLString

  // CASE: object - create ObjectType
  } else if (type === 'object') {
    return reuseOrCreateOt({
      name,
      schema,
      operation,
      data,
      oas,
      iteration,
      isMutation
    })

  // CASE: array - create ArrayType
  } else if (type === 'array') {
    return reuseOrCreateList({
      name,
      schema,
      operation,
      data,
      oas,
      iteration,
      isMutation
    })

  // CASE: enum - create EnumType
  } else if (type === 'enum') {
    return reuseOrCreateEnum({
      name,
      data,
      enumList: schema.enum
    })

  // CASE: scalar - return scalar
  } else {
    return getScalarType(type, data)
  }
}

/**
 * Returns an existing (Input) Object Type or creates a new one, and stores it
 * in data
 *
 * A returned GraphQLObjectType has the following internal structure:
 *
 *   new GraphQLObjectType({
 *     name        // optional name of the type
 *     description // optional description of type
 *     fields      // REQUIRED returning fields
 *       type      // REQUIRED definition of the field type
 *       args      // optional definition of types
 *       resolve   // optional function defining how to obtain this type
 *   })
 */
function reuseOrCreateOt ({
  name,
  schema,
  operation,
  data,
  oas,
  iteration,
  isMutation
} : ReuseOrCreateOtParams) : GQObjectType | GQInputObjectType | GraphQLScalarType {
  // some validation
  if (typeof schema === 'undefined') {
    throw new Error(`No schema passed to reuseOrCreateOt for name '${name}'.`)
  }

  // fetch or create data definition
  let def: DataDefinition = createOrReuseDataDef(schema, {fromRef: name}, data)

  // CASE: query - create or reuse OT
  if (!isMutation) {
    if (def.ot && typeof def.ot !== 'undefined') {
      log(`reuse  Object Type "${def.otName}"`)
      return ((def.ot: any): GQObjectType | GQInputObjectType | GraphQLScalarType)
    } else {
      log(`create Object Type "${def.otName}"`)

      let description = typeof schema.description !== 'undefined'
        ? schema.description : 'No description available.'
      def.ot = new GraphQLObjectType({
        name: def.otName,
        description,
        fields: () => {
          return createFields({
            name: def.otName,
            schema,
            operation,
            data,
            oas,
            iteration,
            isMutation
          })
        }
      })
      return def.ot
    }
  // CASE: mutation - create or reuse IOT
  } else {
    if (typeof def.iot !== 'undefined') {
      log(`reuse  Input Object Type "${def.iotName}"`)
      return ((def.iot: any): GraphQLInputObjectType)
    } else {
      log(`create Input Object Type "${def.iotName}"`)
      def.iot = new GraphQLInputObjectType({
        name: def.iotName,
        description: schema.description, // might be undefined
        // $FlowFixMe: this is a valid thunk being returned
        fields: () => {
          // $FlowFixMe
          return createFields({
            name: def.iotName,
            schema,
            operation,
            data,
            oas,
            iteration,
            isMutation
          })
        }
      })
      return def.iot
    }
  }
}

/**
 * Returns an existing List or creates a new one, and stores it in data
 */
function reuseOrCreateList ({
  name,
  operation,
  schema,
  data,
  oas,
  iteration,
  isMutation
}: ReuseOrCreateListParams) : GraphQLList<any> {
  // minimal error-checking
  if (!('items' in schema)) {
    throw new Error(`Items property missing in array schema definition of ` +
      `'${name}'.`)
  }

  let def = createOrReuseDataDef(
    schema, {fromRef: `${name}List`}, data)

  // try to reuse existing Object Type
  if (!isMutation && def.ot && typeof def.ot !== 'undefined') {
    log(`reuse  GraphQLList "${def.otName}"`)
    return ((def.ot: any): GraphQLList<any>)
  } else if (isMutation && def.iot && typeof def.iot !== 'undefined') {
    log(`reuse  GraphQLList "${def.iotName}"`)
    return ((def.iot: any): GraphQLList<any>)
  }

  // create new List Object Type
  log(`create GraphQLList "${def.otName}"`)

  // determine the type of the list elements
  let itemsSchema = schema.items
  let itemsName = `${name}ListItem`
  if ('$ref' in itemsSchema) {
    itemsSchema = Oas3Tools.resolveRef(itemsSchema['$ref'], oas)
    itemsName = schema.items['$ref'].split('/').pop()
  }

  let itemsType = getGraphQLType({
    name: itemsName,
    schema: itemsSchema,
    data,
    operation,
    oas,
    iteration: iteration + 1,
    isMutation
  })

  if (itemsType !== null) {
    let listObjectType = new GraphQLList(itemsType)

    // store newly created List Object Type
    if (!isMutation) {
      def.ot = listObjectType
    } else {
      def.iot = listObjectType
    }
    return listObjectType
  } else {
    handleWarning({
      typeKey: 'INVALID_SCHEMA_TYPE_LIST_ITEM',
      culprit: `List item '${itemsName}' in list '${name}' with schema: ` +
        `${JSON.stringify(itemsSchema)}`,
      data,
      log
    })
    return new GraphQLList(GraphQLString)
  }
}

/**
 * Returns an existing Enum Type or creates a new one, and stores it in data
 */
function reuseOrCreateEnum ({
  name,
  data,
  enumList
} : ReuseOrCreateEnum) : GQEnumType {
  // try to reuse existing Enum Type
  let def = createOrReuseDataDef(enumList, {fromRef: name}, data)

  if (def.ot && typeof def.ot !== 'undefined') {
    log(`reuse  GraphQLEnumType "${def.otName}"`)
    return ((def.ot: any): GQEnumType)
  } else {
    log(`create GraphQLEnumType "${def.otName}"`)
    let values = {}
    enumList.forEach(e => {
      values[Oas3Tools.beautify(e)] = {
        value: e
      }
    })

    // store newly created Enum Object Type
    def.ot = new GraphQLEnumType({
      name: def.otName,
      values
    })
    return def.ot
  }
}

/**
 * Returns the GraphQL scalar type matching the given JSON schema type
 */
function getScalarType (
  type: string,
  data: PreprocessingData
) : GraphQLScalarType {
  switch (type) {
    case 'string':
      return GraphQLString
    case 'integer':
      return GraphQLInt
    case 'number':
      return GraphQLFloat
    case 'boolean':
      return GraphQLBoolean
    default:
      handleWarning({
        typeKey: 'INVALID_SCHEMA_TYPE_SCALAR',
        culprit: `Unknown JSON scalar type '${type}'`,
        data,
        log
      })
      return GraphQLString
  }
}

/**
 * Creates the fields object to be used by an ObjectType
 */
function createFields ({
  name,
  schema,
  operation,
  data,
  oas,
  iteration,
  isMutation
} : CreateFieldsParams) : FieldsType {
  let fields = {}

  // resolve reference if applicable
  if ('$ref' in schema) {
    schema = Oas3Tools.resolveRef(schema['$ref'], oas)
  }

  // create fields for properties
  for (let propertyKey in schema.properties) {
    let propSchema = schema.properties[propertyKey]
    let propSchemaName = propertyKey // name of schema for this prop's field

    // determine if this property is required in mutations
    let reqMutationProp = (isMutation &&
      ('required' in schema) &&
      schema.required.includes(propertyKey))

    // if properties are referenced, try to reuse schemas
    if ('$ref' in propSchema) {
      propSchemaName = propSchema['$ref'].split('/').pop()
      propSchema = Oas3Tools.resolveRef(propSchema['$ref'], oas)
    }

    // get object type describing the property
    let objectType = getGraphQLType({
      name: propSchemaName,
      schema: propSchema,
      operation,
      data,
      oas,
      iteration: iteration + 1,
      isMutation
    })

    // finally, add the object type to the fields (using sanitized field name)
    if (objectType) {
      let sanePropName = Oas3Tools.beautifyAndStore(propertyKey, data.saneMap)
      fields[sanePropName] = {
        type: reqMutationProp ? new GraphQLNonNull(objectType) : objectType,
        description: propSchema.description // might be undefined
      }
    }
  }

  // create fields for links
  if (iteration === 0 && // only for operation-level object types
    operation && typeof operation === 'object' && // operation is provided
    typeof operation.links === 'object' && // links are present
    !isMutation // only if we are not talking INPUT object type
  ) {
    for (let linkKey in operation.links) {
      log(`create link "${linkKey}"...`)

      // get linked operation
      let linkedOpId
      // TODO: href is yet another alternative to operationRef and operationId
      if (typeof operation.links[linkKey].operationId === 'string') {
        linkedOpId = operation.links[linkKey].operationId
      } else if (typeof operation.links[linkKey].operationRef === 'string') {
        linkedOpId = linkOpRefToOpId({
          linkKey,
          operation,
          name,
          data,
          oas
        })
      }

      // linkedOpId may not be initialized because operationRef may lead to an
      // operation object that does not have an operationId

      if (typeof linkedOpId === 'string' && linkedOpId in data.operations) {
        let linkedOp = data.operations[linkedOpId]

        // determine parameters provided via link
        let argsFromLink = operation.links[linkKey].parameters

        // remove argsFromLinks from operation parameters
        let dynamicParams = linkedOp.parameters
        if (typeof argsFromLink === 'object') {
          dynamicParams = dynamicParams.filter(p => {
            // here, we know argsFromLink is present:
            argsFromLink = ((argsFromLink: any): Object)
            return (typeof argsFromLink[p.name] === 'undefined')
          })
        }

        // get resolve function for link
        let linkResolver = getResolver({
          operation: linkedOp,
          argsFromLink,
          data,
          oas
        })

        // get args for link
        let args = getArgs({
          parameters: dynamicParams,
          operation,
          data,
          oas
        })

        /**
         * get response object type
         * use the reference here
         * OT will be built up some other time
         */
        let resObjectType = linkedOp.resDef.ot

        // finally, add the object type to the fields (using sanitized field name)
        let saneLinkKey = Oas3Tools.beautifyAndStore(linkKey, data.saneMap)
        fields[saneLinkKey] = {
          type: resObjectType,
          resolve: linkResolver,
          args,
          description: operation.links[linkKey].description // may be undefined
        }
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit: linkKey,
          data,
          log
        })
      }
    }
  }

  // create fields for subOperations
  if (iteration === 0 && operation && typeof operation === 'object' &&
    Array.isArray(operation.subOps)) {
    for (let subOp of operation.subOps) {
      // here, we know the operation is present
      operation = ((operation: any): Operation)
      let fieldName = subOp.resDef.otName
      let otName = operation.resDef.otName

      // check for collision with existing field name:
      if (typeof fields[fieldName] !== 'undefined') {
        handleWarning({
          typeKey: 'LINK_NAME_COLLISION',
          culprit: fieldName,
          data,
          log
        })
        continue
      }

      log(`add sub operation '${fieldName}' to ` +
        `'${otName}'`)

      // determine parameters provided via parent operation
      let argsFromParent = operation.parameters.filter(param => {
        return param.in === 'path'
      }).map(args => args.name)

      let subOpResolver = getResolver({
        operation: subOp,
        argsFromParent,
        data,
        oas
      })

      let dynamicParams = subOp.parameters.filter(parameter => {
        return !argsFromParent.includes(parameter.name)
      })

      // get args
      let args = getArgs({
        parameters: dynamicParams,
        operation,
        data,
        oas
      })

      fields[fieldName] = {
        type: subOp.resDef.ot,
        resolve: subOpResolver,
        args,
        description: subOp.resDef.schema.description
      }
    }
  }
  return fields
}

/**
 * Returns the operationId that an operationRef is associated to
 *
 * NOTE: If the operation does not natively have operationId, this function
 *  will try to produce an operationId the same way preprocessor.js does it.
 *
 *  Any changes to constructing operationIds in preprocessor.js should be
 *  reflected here.
 */
function linkOpRefToOpId ({
  linkKey,
  operation,
  name,
  data,
  oas
}) : ?string {
  let linkedOpId

  if (typeof operation.links[linkKey].operationRef === 'string') {
    // TODO: external refs

    let operationRef = operation.links[linkKey].operationRef
    let linkRelativePathAndMethod

    // example relative path: '#/paths/~12.0~1repositories~1{username}/get'
    // example absolute path: 'https://na2.gigantic-server.com/#/paths/~12.0~1repositories~1{username}/get'
    //
    // extract relative path from relative path
    if (operationRef.substring(0, 8) === '#/paths/') {
      linkRelativePathAndMethod = operationRef

    // extract relative path from absolute path
    } else {
      // '#' may exist in other places in the path
      // '/#/' is more likely to point to the beginning of the path
      let firstPathIndex = operationRef.indexOf('/#/paths/')

      // found a relative path candidate
      if (firstPathIndex !== -1) {
        // check to see if there are other relative path candidates
        let lastPathIndex = operationRef.lastIndexOf('/#/paths/')
        if (firstPathIndex !== lastPathIndex) {
          handleWarning({
            typeKey: 'AMBIGUOUS_LINK',
            culprit: operationRef,
            data,
            log
          })
        }

        // +1 to avoid the first '/'
        linkRelativePathAndMethod = operationRef.substring(firstPathIndex + 1)

      // cannot find relative path candidate
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit: `Link '${linkKey}' has not relative path in operationRef ` +
            `'${operationRef}'`,
          data,
          log
        })
        return
      }
    }

    // infer operationId from relative path
    if (typeof linkRelativePathAndMethod === 'string') {
      let linkPath
      let linkMethod

      // NOTE: I wish we could extract the linkedOpId by matching the
      //  linkedOpObject with an operation in data and extracting the
      //  operationId there but that does not seem to be possible
      //  especiially because you need to know the operationId just to
      //  access the operations so what I have to do is reconstruct the
      //  operationId the same way preprocessing does it

      // linkPath should be the path followed by the method
      // find the slash that divides the path from the method
      let pivotSlashIndex = linkRelativePathAndMethod.lastIndexOf('/')

      // check if there are any '/' in the linkPath
      if (pivotSlashIndex !== -1) {
        // getting method
        // check if there is a method at the end of the linkPath
        if (pivotSlashIndex !== linkRelativePathAndMethod.length - 1) {
          // start at +1 because we do not want the starting '/'
          linkMethod = linkRelativePathAndMethod.substring(pivotSlashIndex + 1)

          // check if method is a valid method
          if (!(Oas3Tools.OAS_OPERATIONS.includes(linkMethod))) {
            handleWarning({
              typeKey: 'UNRESOLVABLE_LINK',
              culprit: `Method '${linkMethod}' in operationRef ` +
                `'${operationRef}' is invalid`,
              data,
              log
            })
            return
          }
        // there is no method at the end of the path
        } else {
          handleWarning({
            typeKey: 'UNRESOLVABLE_LINK',
            culprit: `No valid method targeted by operationRef ` +
              `'${operationRef}'`,
            data,
            log
          })
          return
        }

        // getting path
        // substring ends at pivotSlashIndex to exclude '/'
        // TODO: improve removing '/#/paths'?
        linkPath = linkRelativePathAndMethod.substring(7, pivotSlashIndex)

        if (typeof linkMethod === 'string' && typeof linkPath === 'string') {
          if (linkPath in oas.paths && linkMethod in oas.paths[linkPath]) {
            let linkedOpObject = oas.paths[linkPath][linkMethod]

            if ('operationId' in linkedOpObject) {
              linkedOpId = linkedOpObject.operationId
            }
          }

          if (typeof linkedOpId !== 'string') {
            linkedOpId = ((Oas3Tools.beautify(`${linkMethod}:${linkPath}`) : any) : string)
          }

          if (linkedOpId in data.operations) {
            return linkedOpId
          } else {
            handleWarning({
              typeKey: 'UNRESOLVABLE_LINK',
              culprit: `Could not find operationId '${linkedOpId}' in link ` +
                `'${linkKey}'`,
              data,
              log
            })
          }
        // path and method could not be found
        } else {
          handleWarning({
            typeKey: 'UNRESOLVABLE_LINK',
            culprit: `Could not find path and/or method from operationRef ` +
              `'${operationRef}' in link '${linkKey}'`,
            data,
            log
          })
        }

      // Cannot split relative path into path and method sections
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit: `Could not extract path and/or method from operationRef ` +
            `'${operationRef}' in link '${linkKey}'`,
          data,
          log
        })
      }

    // Cannot extract relative path from absolute path
    } else {
      handleWarning({
        typeKey: 'UNRESOLVABLE_LINK',
        culprit: `Could not extract relative path from operationRef ` +
          `'${operationRef}' in link '${linkKey}'`,
        data,
        log
      })
    }
  }
}

/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
export function getArgs ({
  parameters,
  reqSchema,
  reqSchemaName,
  data,
  oas,
  operation
} : GetArgsParams) : Args {
  let args = {}

  // handle params:
  for (let parameter of parameters) {
    // we need at least a name
    if (typeof parameter.name !== 'string') {
      handleWarning({
        typeKey: 'UNNAMED_PARAMETER',
        culprit: JSON.stringify(parameter),
        data,
        log
      })
      continue
    }

    // if this parameter is provided via options, ignore
    if (typeof data.options === 'object') {
      if (typeof data.options.headers === 'object' &&
        parameter.name in data.options.headers) {
        continue
      }
      if (typeof data.options.qs === 'object' &&
        parameter.name in data.options.qs) {
        continue
      }
    }

    // sanitize the argument name
    // NOTE: when matching these parameters back to requests, we need to again
    // use the real parameter name
    let saneName = Oas3Tools.beautify(parameter.name)

    // determine type of parameter (often, there is none - assume string)
    let type = GraphQLString
    if (typeof parameter.schema === 'object') {
      type = getGraphQLType({
        name: saneName,
        schema: parameter.schema,
        operation,
        data,
        oas,
        iteration: 0,
        isMutation: true
      })
    }

    // parameters are not required when a default exists:
    let hasDefault = false
    if (typeof parameter.schema === 'object') {
      let schema = parameter.schema
      if (typeof schema.$ref === 'string') {
        schema = Oas3Tools.resolveRef(parameter.schema.$ref, oas)
      }
      if (typeof schema.default !== 'undefined') {
        hasDefault = true
      }
    }
    let paramRequired = parameter.required && !hasDefault

    args[saneName] = {
      type: paramRequired ? new GraphQLNonNull(type) : type,
      description: parameter.description // might be undefined
    }
  }

  // handle request schema (if present):
  if (typeof reqSchemaName === 'string' &&
    reqSchema && typeof reqSchema === 'object') {
    let reqObjectType = getGraphQLType({
      name: reqSchemaName,
      schema: reqSchema,
      data,
      operation,
      oas,
      isMutation: true
    })

    // sanitize the argument name
    let saneName = Oas3Tools.beautify(reqSchemaName)
    let reqRequired = false
    if (operation && typeof operation === 'object' &&
      typeof operation.reqRequired === 'boolean') {
      reqRequired = operation.reqRequired
    }
    args[saneName] = {
      type: reqRequired ? new GraphQLNonNull(reqObjectType) : reqObjectType,
      description: typeof reqSchema.description === 'undefined'
        ? 'No description available.' : reqSchema.description
    }
  }
  return args
}
