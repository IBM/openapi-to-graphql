// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */

// Type imports:
import { PreprocessingData } from './types/preprocessing_data'
import { Operation, DataDefinition } from './types/operation'
import {
  Oas3,
  SchemaObject,
  ParameterObject,
  ReferenceObject,
  LinkObject,
  LinksObject
} from './types/oas3'
import { Args, Field, GraphQLType } from './types/graphql'
import {
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInputObjectType,
  GraphQLEnumType,
  GraphQLFieldConfigMap,
  GraphQLOutputType
} from 'graphql'

// Imports:
import * as GraphQLJSON from 'graphql-type-json'
import * as Oas3Tools from './oas_3_tools'
import { getResolver } from './resolver_builder'
import { createDataDef } from './preprocessor'
import debug from 'debug'
import { handleWarning, sortObject } from './utils'

// Type definitions & exports:
type GetGraphQLTypeParams = {
  def: DataDefinition
  operation?: Operation
  data: PreprocessingData // data produced by preprocessing
  iteration?: number // count of recursions used to create type
  isMutation?: boolean // whether to create an Input Type
  oass: Oas3[] // input OAS 3
}

type GetArgsParams = {
  def?: DataDefinition
  parameters: ParameterObject[]
  operation?: Operation
  data: PreprocessingData
  oass: Oas3[]
}

type CreateOrReuseOtParams = {
  def: DataDefinition
  operation?: Operation
  iteration: number
  isMutation: boolean
  data: PreprocessingData
  oass: Oas3[]
}

type ReuseOrCreateListParams = {
  def: DataDefinition
  operation?: Operation
  iteration: number
  isMutation: boolean
  data: PreprocessingData
  oass: Oas3[]
}

type ReuseOrCreateEnum = {
  def: DataDefinition
  data: PreprocessingData
}

type ReuseOrCreateScalar = {
  def: DataDefinition
  data: PreprocessingData
}

type CreateFieldsParams = {
  def: DataDefinition
  links: { [key: string]: LinkObject }
  operation?: Operation
  iteration: number
  isMutation: boolean
  data: PreprocessingData
  oass: Oas3[]
}

type LinkOpRefToOpIdParams = {
  links: { [key: string]: LinkObject }
  linkKey: string
  operation: Operation
  data: PreprocessingData
  oass: Oas3[]
}

const translationLog = debug('translation')

/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
export function getGraphQLType({
  def,
  operation,
  data,
  iteration = 0,
  isMutation = false,
  oass
}: GetGraphQLTypeParams): GraphQLType {
  const name = isMutation ? def.iotName : def.otName

  // avoid excessive iterations
  if (iteration === 50) {
    throw new Error(`Too many iterations when creating schema ${name}`)
  }

  const type = def.type

  // CASE: object - create ObjectType
  if (type === 'object') {
    return createOrReuseOt({
      def,
      operation,
      data,
      oass,
      iteration,
      isMutation
    })

    // CASE: array - create ArrayType
  } else if (type === 'array') {
    return reuseOrCreateList({
      def,
      operation,
      data,
      oass,
      iteration,
      isMutation
    })

    // CASE: enum - create EnumType
  } else if (type === 'enum') {
    return reuseOrCreateEnum({
      def,
      data
    })

    // CASE: scalar - return scalar
  } else {
    return getScalarType({
      def,
      data
    })
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
function createOrReuseOt({
  def,
  operation,
  data,
  iteration,
  isMutation,
  oass
}: CreateOrReuseOtParams): GraphQLType {
  const schema = def.schema

  // CASE: query - create or reuse OT
  if (!isMutation) {
    if (def.ot && typeof def.ot !== 'undefined') {
      translationLog(
        `Reuse Object Type '${def.otName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )
      return def.ot as (
        | GraphQLObjectType
        | GraphQLInputObjectType
        | GraphQLScalarType)
    } else {
      translationLog(
        `Create Object Type '${def.otName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )

      const description =
        typeof schema.description !== 'undefined'
          ? schema.description
          : 'No description available.'
      def.ot = new GraphQLObjectType({
        name: def.otName,
        description,
        fields: () => {
          return createFields({
            def,
            links: def.links,
            operation,
            data,
            oass,
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
      translationLog(
        `Reuse Input Object Type '${def.iotName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )
      return def.iot as GraphQLInputObjectType
    } else {
      translationLog(
        `Create Input Object Type '${def.iotName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )

      schema.description =
        typeof schema.description !== 'undefined'
          ? schema.description
          : 'No description available.'

      def.iot = new GraphQLInputObjectType({
        name: def.iotName,
        description: schema.description,
        // @ts-ignore
        fields: () => {
          return createFields({
            def,
            links: undefined,
            operation,
            data,
            iteration,
            isMutation,
            oass
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
function reuseOrCreateList({
  def,
  operation,
  iteration,
  isMutation,
  data,
  oass
}: ReuseOrCreateListParams): GraphQLList<any> {
  const name = isMutation ? def.iotName : def.otName

  // try to reuse existing Object Type
  if (!isMutation && def.ot && typeof def.ot !== 'undefined') {
    translationLog(`Reuse GraphQLList '${def.otName}'`)
    return def.ot as GraphQLList<any>
  } else if (isMutation && def.iot && typeof def.iot !== 'undefined') {
    translationLog(`Reuse GraphQLList '${def.iotName}'`)
    return def.iot as GraphQLList<any>
  }

  // create new List Object Type
  translationLog(`Create GraphQLList '${def.otName}'`)

  // Get definition of the list item, which should be in the sub definitions
  const itemDef = def.subDefinitions as DataDefinition

  // Equivalent to schema.items
  const itemsSchema = itemDef.schema
  // Equivalent to `${name}ListItem`
  const itemsName = itemDef.otName

  const itemsType = getGraphQLType({
    def: itemDef,
    data,
    operation,
    oass,
    iteration: iteration + 1,
    isMutation
  })

  if (itemsType !== null) {
    const listObjectType = new GraphQLList(itemsType)

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
      culprit:
        `List item '${itemsName}' in list '${name}' with schema: ` +
        `'${JSON.stringify(itemsSchema)}'`,
      data,
      log: translationLog
    })
    return new GraphQLList(GraphQLString)
  }
}

/**
 * Returns an existing Enum Type or creates a new one, and stores it in data
 */
function reuseOrCreateEnum({ def, data }: ReuseOrCreateEnum): GraphQLEnumType {
  // try to reuse existing Enum Type
  if (def.ot && typeof def.ot !== 'undefined') {
    translationLog(`Reuse  GraphQLEnumType '${def.otName}'`)
    return def.ot as GraphQLEnumType
  } else {
    translationLog(`Create GraphQLEnumType '${def.otName}'`)
    const values = {}
    def.schema.enum.forEach(e => {
      values[Oas3Tools.beautify(e, false)] = {
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
function getScalarType({ def, data }: ReuseOrCreateScalar): GraphQLScalarType {
  const type = def.type

  switch (type) {
    case 'string':
      def.ot = GraphQLString
      break
    case 'integer':
      def.ot = GraphQLInt
      break
    case 'number':
      def.ot = GraphQLFloat
      break
    case 'boolean':
      def.ot = GraphQLBoolean
      break
    case 'json':
      def.ot = GraphQLJSON
      break
    default:
      handleWarning({
        typeKey: 'INVALID_SCHEMA_TYPE_SCALAR',
        culprit: `Unknown JSON scalar type '${type}'`,
        data,
        log: translationLog
      })
      def.ot = GraphQLString
      break
  }

  return def.ot as GraphQLScalarType
}

/**
 * Creates the fields object to be used by an ObjectType
 */
function createFields({
  def,
  links,
  operation,
  data,
  iteration,
  isMutation,
  oass
}: CreateFieldsParams): GraphQLFieldConfigMap<any, any> {
  let fields: GraphQLFieldConfigMap<any, any> = {}

  const fieldTypeDefinitions = def.subDefinitions as {
    [fieldName: string]: DataDefinition
  }

  // create fields for properties
  for (let fieldTypeKey in fieldTypeDefinitions) {
    const fieldTypeDefinition = fieldTypeDefinitions[fieldTypeKey]
    const schema = fieldTypeDefinition.schema

    // get object type describing the property
    const objectType = getGraphQLType({
      def: fieldTypeDefinition,
      operation,
      data,
      oass,
      iteration: iteration + 1,
      isMutation
    })

    // determine if this property is required in mutations
    const reqMutationProp =
      isMutation &&
      'required' in schema &&
      schema.required.includes(fieldTypeKey)

    // finally, add the object type to the fields (using sanitized field name)
    if (objectType) {
      const sanePropName = Oas3Tools.beautifyAndStore(
        fieldTypeKey,
        data.saneMap
      )
      fields[sanePropName] = {
        type: reqMutationProp
          ? new GraphQLNonNull(objectType)
          : (objectType as GraphQLOutputType),

        description:
          typeof def.schema.description === 'undefined'
            ? 'No description available.'
            : def.schema.description
      }
    }
  }

  // create fields for links
  if (
    iteration === 0 && // only for operation-level object types
    operation &&
    typeof operation === 'object' && // operation is provided
    typeof links === 'object' && // links are present
    !isMutation // only if we are not talking INPUT object type
  ) {
    for (let linkKey in links) {
      translationLog(`Create link '${linkKey}'...`)
      const link = links[linkKey]

      // get linked operation
      let linkedOpId
      // TODO: href is yet another alternative to operationRef and operationId
      if (typeof link.operationId === 'string') {
        linkedOpId = link.operationId
      } else if (typeof link.operationRef === 'string') {
        linkedOpId = linkOpRefToOpId({
          links,
          linkKey,
          operation,
          data,
          oass
        })
      }

      // linkedOpId may not be initialized because operationRef may lead to an
      // operation object that does not have an operationId
      if (typeof linkedOpId === 'string' && linkedOpId in data.operations) {
        const linkedOp = data.operations[linkedOpId]

        // determine parameters provided via link
        let argsFromLink = link.parameters

        // remove argsFromLinks from operation parameters
        let dynamicParams = linkedOp.parameters
        if (typeof argsFromLink === 'object') {
          dynamicParams = dynamicParams.filter(p => {
            // here, we know argsFromLink is present:
            argsFromLink = argsFromLink as Object
            return typeof argsFromLink[p.name] === 'undefined'
          })
        }

        // get resolve function for link
        const linkResolver = getResolver({
          operation: linkedOp,
          argsFromLink: Oas3Tools.beautifyObjectKeys(argsFromLink) as {
            [key: string]: string
          },
          data,
          baseUrl: data.options.baseUrl
        })

        // get args for link
        const args = getArgs({
          parameters: dynamicParams,
          operation,
          data,
          oass
        })

        /**
         * get response object type
         * use the reference here
         * OT will be built up some other time
         */
        const resObjectType = linkedOp.responseDefinition.ot

        let description = link.description

        if (typeof description !== 'string') {
          description = 'No description available.'
        }

        if (oass.length === 1) {
          description += `\n\nEquivalent to ${linkedOp.method.toUpperCase()} ${
            linkedOp.path
          }`
        } else {
          description += `\n\nEquivalent to ${
            operation.oas.info.title
          } ${linkedOp.method.toUpperCase()} ${linkedOp.path}`
        }

        // finally, add the object type to the fields (using sanitized field name)
        const saneLinkKey = Oas3Tools.beautifyAndStore(linkKey, data.saneMap)
        fields[saneLinkKey] = {
          type: resObjectType,
          resolve: linkResolver,
          args,
          description
        }
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit: linkKey,
          data,
          log: translationLog
        })
      }
    }
  }

  fields = sortObject(fields)
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
function linkOpRefToOpId({
  links,
  linkKey,
  operation,
  data,
  oass
}: LinkOpRefToOpIdParams): string {
  const link = links[linkKey]

  let linkedOpId
  if (typeof link.operationRef === 'string') {
    // TODO: external refs

    const operationRef = link.operationRef
    let linkLocation
    let linkRelativePathAndMethod

    // example relative path: '#/paths/~12.0~1repositories~1{username}/get'
    // example absolute path: 'https://na2.gigantic-server.com/#/paths/~12.0~1repositories~1{username}/get'
    // extract relative path from relative path
    if (operationRef.substring(0, 8) === '#/paths/') {
      linkRelativePathAndMethod = operationRef

      // extract relative path from absolute path
    } else {
      // '#' may exist in other places in the path
      // '/#/' is more likely to point to the beginning of the path
      const firstPathIndex = operationRef.indexOf('#/paths/')

      // found a relative path candidate
      if (firstPathIndex !== -1) {
        // check to see if there are other relative path candidates
        const lastPathIndex = operationRef.lastIndexOf('#/paths/')
        if (firstPathIndex !== lastPathIndex) {
          handleWarning({
            typeKey: 'AMBIGUOUS_LINK',
            culprit: operationRef,
            data,
            log: translationLog
          })
        }

        linkLocation = operationRef.substring(0, firstPathIndex)
        linkRelativePathAndMethod = operationRef.substring(firstPathIndex)

        // cannot find relative path candidate
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit:
            `Link '${linkKey}' has not relative path in operationRef ` +
            `'${operationRef}'`,
          data,
          log: translationLog
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
      const pivotSlashIndex = linkRelativePathAndMethod.lastIndexOf('/')

      // check if there are any '/' in the linkPath
      if (pivotSlashIndex !== -1) {
        // getting method
        // check if there is a method at the end of the linkPath
        if (pivotSlashIndex !== linkRelativePathAndMethod.length - 1) {
          // start at +1 because we do not want the starting '/'
          linkMethod = linkRelativePathAndMethod.substring(pivotSlashIndex + 1)

          // check if method is a valid method
          if (!Oas3Tools.OAS_OPERATIONS.includes(linkMethod)) {
            handleWarning({
              typeKey: 'UNRESOLVABLE_LINK',
              culprit:
                `Method '${linkMethod}' in operationRef ` +
                `'${operationRef}' is invalid`,
              data,
              log: translationLog
            })
            return
          }
          // there is no method at the end of the path
        } else {
          handleWarning({
            typeKey: 'UNRESOLVABLE_LINK',
            culprit:
              `No valid method targeted by operationRef ` + `'${operationRef}'`,
            data,
            log: translationLog
          })
          return
        }

        // getting path
        // substring starts at index 8 and ends at pivotSlashIndex to exclude
        // the '/'s at the ends of the path
        // TODO: improve removing '/#/paths'?
        linkPath = linkRelativePathAndMethod.substring(8, pivotSlashIndex)

        // linkPath is currently a JSON Pointer
        // revert the escaped '/', represented by '~1', to form intended
        // path
        linkPath = linkPath.replace(/~1/g, '/')

        // find the right oas
        const oas =
          typeof linkLocation === 'undefined'
            ? operation.oas
            : getOasFromLinkLocation(linkLocation, link, data, oass)

        // if the link was external, make sure that an OAS could be identified
        if (typeof oas !== 'undefined') {
          if (typeof linkMethod === 'string' && typeof linkPath === 'string') {
            if (linkPath in oas.paths && linkMethod in oas.paths[linkPath]) {
              const linkedOpObject = oas.paths[linkPath][linkMethod]

              if ('operationId' in linkedOpObject) {
                linkedOpId = linkedOpObject.operationId
              }
            }

            if (typeof linkedOpId !== 'string') {
              linkedOpId = Oas3Tools.generateOperationId(linkMethod, linkPath)
            }

            if (linkedOpId in data.operations) {
              return linkedOpId
            } else {
              handleWarning({
                typeKey: 'UNRESOLVABLE_LINK',
                culprit:
                  `Could not find operationId '${linkedOpId}' in link ` +
                  `'${linkKey}'`,
                data,
                log: translationLog
              })
            }

            // path and method could not be found
          } else {
            handleWarning({
              typeKey: 'UNRESOLVABLE_LINK',
              culprit:
                `Could not find path and/or method from operationRef ` +
                `'${operationRef}' in link '${linkKey}'`,
              data,
              log: translationLog
            })
          }

          // external link could not be resolved
        } else {
          handleWarning({
            typeKey: 'UNRESOLVABLE_LINK',
            culprit:
              `OAS of external link '${link.operationRef}' could not ` +
              `be identified`,
            data,
            log: translationLog
          })
        }

        // Cannot split relative path into path and method sections
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit:
            `Could not extract path and/or method from operationRef ` +
            `'${operationRef}' in link '${linkKey}'`,
          data,
          log: translationLog
        })
      }

      // Cannot extract relative path from absolute path
    } else {
      handleWarning({
        typeKey: 'UNRESOLVABLE_LINK',
        culprit:
          `Could not extract relative path from operationRef ` +
          `'${operationRef}' in link '${linkKey}'`,
        data,
        log: translationLog
      })
    }
  }
}

/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
export function getArgs({
  def,
  parameters,
  operation,
  data,
  oass
}: GetArgsParams): Args {
  let args = {}

  // handle params:
  for (let parameter of parameters) {
    // we need at least a name
    if (typeof parameter.name !== 'string') {
      handleWarning({
        typeKey: 'UNNAMED_PARAMETER',
        culprit: JSON.stringify(parameter),
        data,
        log: translationLog
      })
      continue
    }

    // if this parameter is provided via options, ignore
    if (typeof data.options === 'object') {
      if (
        typeof data.options.headers === 'object' &&
        parameter.name in data.options.headers
      ) {
        continue
      }
      if (
        typeof data.options.qs === 'object' &&
        parameter.name in data.options.qs
      ) {
        continue
      }
    }

    // determine type of parameter (often, there is none - assume string)
    let type = GraphQLString
    if (typeof parameter.schema === 'object') {
      let schema = parameter.schema
      if ('$ref' in parameter.schema) {
        schema = Oas3Tools.resolveRef(parameter.schema['$ref'], operation.oas)
      }

      // TODO: remove
      const paramDef = createDataDef(
        { fromRef: parameter.name },
        schema as SchemaObject,
        true,
        data
      )

      // @ts-ignore
      type = getGraphQLType({
        def: paramDef,
        operation,
        data,
        oass,
        iteration: 0,
        isMutation: true
      })
    }

    // sanitize the argument name
    // NOTE: when matching these parameters back to requests, we need to again
    // use the real parameter name
    const saneName = Oas3Tools.beautify(parameter.name)

    // parameters are not required when a default exists:
    let hasDefault = false
    if (typeof parameter.schema === 'object') {
      let schema = parameter.schema
      if (typeof schema.$ref === 'string') {
        schema = Oas3Tools.resolveRef(parameter.schema.$ref, operation.oas)
      }
      if (typeof (schema as SchemaObject).default !== 'undefined') {
        hasDefault = true
      }
    }
    const paramRequired = parameter.required && !hasDefault

    args[saneName] = {
      type: paramRequired ? new GraphQLNonNull(type) : type,
      description: parameter.description // might be undefined
    }
  }

  // handle request schema (if present):
  if (typeof def === 'object') {
    const reqObjectType = getGraphQLType({
      def,
      data,
      operation,
      oass,
      isMutation: true
    })

    // sanitize the argument name
    const saneName = Oas3Tools.beautify(def.iotName)
    let reqRequired = false
    if (
      operation &&
      typeof operation === 'object' &&
      typeof operation.payloadRequired === 'boolean'
    ) {
      reqRequired = operation.payloadRequired
    }
    args[saneName] = {
      type: reqRequired ? new GraphQLNonNull(reqObjectType) : reqObjectType,
      description:
        typeof def.schema.description === 'undefined'
          ? 'No description available.'
          : def.schema.description
    }
  }

  args = sortObject(args)
  return args
}

/**
 * Used in the context of links, specifically those using an external operationRef
 * If the reference is an absolute reference, determine the type of location
 *
 * For example, name reference, file path, web-hosted OAS link, etc.
 */
function getLinkLocationType(linkLocation: string): string {
  // TODO
  // Currently we only support the title as a link location
  return 'title'
}

/**
 * Used in the context of links, specifically those using an external operationRef
 * Based on the location of the OAS, retrieve said OAS
 */
function getOasFromLinkLocation(
  linkLocation: string,
  link: LinkObject,
  data: PreprocessingData,
  oass: Oas3[]
): Oas3 {
  // may be an external reference
  switch (getLinkLocationType(linkLocation)) {
    case 'title':
      // get the possible
      const possibleOass = oass.filter(oas => {
        return oas.info.title === linkLocation
      })

      // check if there are an ambiguous OASs
      if (possibleOass.length === 1) {
        // no ambiguity
        return possibleOass[0]
      } else if (possibleOass.length > 1) {
        // some ambiguity
        handleWarning({
          typeKey: 'AMBIGUOUS_LINK',
          culprit:
            `Multiple OASs share the same title '${linkLocation}' in ` +
            `the operationRef '${link.operationRef}'`,
          data,
          log: translationLog
        })
      } else {
        // no OAS had the expected title
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit:
            `No OAS has the title '${linkLocation}' in the ` +
            `operationRef '${link.operationRef}'`,
          data,
          log: translationLog
        })
      }

      break

    // // TODO
    // case 'url':
    //   break

    // // TODO
    // case 'file':
    //   break

    // TODO: should title be default?
    // In cases of names like api.io
    default:
      handleWarning({
        typeKey: 'UNRESOLVABLE_LINK',
        culprit:
          `The link location of the operationRef ` +
          `'${link.operationRef}' is currently not supported\n` +
          `Currently only the title of the OAS is supported`,
        data,
        log: translationLog
      })
  }
}
