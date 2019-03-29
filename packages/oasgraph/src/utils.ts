// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {
  PreprocessingData
} from './types/preprocessing_data'
import {
  Warning
} from './types/options'

export const WarningTypes: {
  [key: string]: (culprit: string, solution: string) => Warning
} = {
  /**
   * Authentication
   */
  UNSUPPORTED_HTTP_AUTH_SCHEME: (culprit: string, solution: string) => {
    return {
      type: 'UnsupportedHTTPAuthScheme',
      message: `Unsupported HTTP authentication scheme '${culprit}'.`,
      mitigation: `Ignore operation`
    }
  },
  MULTIPLE_RESPONSES: (culprit: string, solution: string) => {
    return {
      type: 'MultipleResponses',
      message: `Operation '${culprit}' has more than one success status ` +
        `codes (200 - 299).`,
      mitigation: `Will select response for status code '${solution}'`
    }
  },
  MISSING_RESPONSE_SCHEMA: (culprit: string, solution: string) => {
    return {
      type: 'MissingResponseSchema',
      message: `Operation '${culprit}' has no (valid) response schema. ` + 
      `You can create placeholder schemas using the fillEmptyResponses option.`,
      mitigation: `Ignore operation`
    }
  },
  INVALID_SCHEMA_TYPE: (culprit: string, solution: string) => {
    return {
      type: 'InvalidSchemaType',
      message: `Request / response schema has no (valid) type: ${culprit}`,
      mitigation: `Fall back to type 'GraphQL String'`
    }
  },
  INVALID_SCHEMA_TYPE_LIST_ITEM: (culprit: string, solution: string) => {
    return {
      type: 'InvalidSchemaTypeListItem',
      message: `Request / response schema has no (valid) type: ${culprit}`,
      mitigation: `Fall back to type 'GraphQL String'`
    }
  },
  INVALID_SCHEMA_TYPE_SCALAR: (culprit: string, solution: string) => {
    return {
      type: 'InvalidSchemaTypeScalar',
      message: `Request / response schema has no (valid) type: ${culprit}`,
      mitigation: `Fall back to type 'GraphQL String'`
    }
  },
  UNRESOLVABLE_LINK: (culprit: string, solution: string) => {
    return {
      type: 'UnresolvableLink',
      message: `Cannot resolve target of link: ${culprit}.`,
      mitigation: `Ignore link`
    }
  },
  AMBIGUOUS_LINK: (culprit: string, solution: string) => {
    return {
      type: 'AmbiguousLink',
      message: `Cannot unambiguously resolve operationRef '${culprit}' in link.`,
      mitigation: `Use first occurance of '#/' - may cause runtime errors`
    }
  },
  LINK_NAME_COLLISION: (culprit: string, solution: string) => {
    return {
      type: 'LinkNameCollision',
      message: `Cannot create link '${culprit}' because Object Type already ` +
        `contains field of the same name.`,
      mitigation: `Ignore link`
    }
  },
  UNNAMED_PARAMETER: (culprit: string, solution: string) => {
    return {
      type: 'UnnamedParameter',
      message: `Parameter misses 'name' property: ${culprit}.`,
      mitigation: `Ignore parameter`
    }
  },
  DUPLICATE_FIELD_NAME: (culprit: string, solution: string) => {
    return {
      type: 'duplicateFieldName',
      message: `Field name '${culprit}' is already present in the object.`,
      mitigation: `Ignore duplicate field`
    }
  },
  DUPLICATE_OPERATION: (culprit: string, solution: string) => {
    return {
      type: 'duplicateOperation',
      message: `Multiple OASs share operations with the same operationId '${culprit}'`,
      mitigation: `The operation from the OAS '${solution}' will replace the previous one`
    }
  },
  DUPLICATE_SECURITY_SCHEME: (culprit: string, solution: string) => {
    return {
      type: 'duplicateSecurity',
      message: `Multiple OASs share security schemes with the same name '${culprit}'`,
      mitigation: `The security scheme from the OAS '${solution}' will replace the previous one`
    }
  },
  DUPLICATE_LINK_KEY: (culprit: string, solution: string) => {
    return {
      type: 'duplicateLinkKey',
      message: `Multiple operations with the same response body schema share the same link key '${culprit}'`,
      // TODO: improve mitigation message
      mitigation: `The link will replace the previous one`
    }
  },
  UNRESOLVABLE_REFERENCE: (culprit: string, solution: string) => {
    return {
      type: 'unresolvableReference',
      message: `A schema reference could not be resolved due to unknown OAS origin`,
      mitigation: `The schema will not be resolved, which may cause issues`
    }
  }
}

/**
 * Utilities that are specific to OASGraph
 */
export function handleWarning ({
  typeKey,
  culprit,
  solution = '',
  data,
  log
}: {
  typeKey: string, // eslint-disable-line
  culprit: string,
  solution?: string,
  data: PreprocessingData,
  log?: Function
}) {
  let warning = WarningTypes[typeKey](culprit, solution)

  if (data.options.strict) {
    throw new Error(`${warning.type} - ${warning.message}`)
  } else {
    let output = `Warning: ${warning.message} - ${warning.mitigation}`
    if (typeof log === 'function') {
      log(output)
    } else {
      console.log(output)
    }
    data.options.report.warnings.push(warning)
  }
}

// Code provided by codename- from StackOverflow
// Link: https://stackoverflow.com/a/29622653
export function sortObject(o) {
  return Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {});
}

/**
 * Finds the common property names between two objects
 */
export function getCommonPropertyNames(object1, object2): string[] {
  return Object.keys(object1).filter((propertyName) => {
    return propertyName in object2
  })
}