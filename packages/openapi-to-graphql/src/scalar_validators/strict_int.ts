import { GraphQLScalarType, ValueNode } from 'graphql'
import {
  defaultErrorHandler,
  defaultSerialize,
  getValueFromValueNode
} from './common_def'

import { isTypeOf } from '../utils'

import {
  StrictScalarNumberConfig,
  NumberScalarErrorCode
} from '../types/strict_scalars'

export const createIntScalar = <TInternal = string, TExternal = string>(
  config: StrictScalarNumberConfig
): GraphQLScalarType => {
  const {
    coerce,
    errorHandler,
    maximum,
    minimum,
    sanitize,
    validate,
    serialize,
    ...scalarConfig
  } = config

  const handleError = errorHandler || defaultErrorHandler

  const parseValue = (
    unknownValue: unknown,
    ast?: ValueNode
  ): TInternal | null => {
    // null inputs don't come here

    // Coersion Phase

    if (unknownValue == null) {
      return null
    }

    let value: number

    if (isTypeOf(unknownValue, 'number')) {
      value = unknownValue as number
    } else {
      if (coerce) {
        const valueOrNull = coerce(unknownValue)

        if (valueOrNull == null) {
          return null
        }

        value = valueOrNull
      } else {
        return handleError({
          code: 'type',
          originalValue: unknownValue,
          value: unknownValue,
          ast,
          config
        })
      }
    }

    // Sanitization Phase

    if (sanitize && value != null) {
      const valueOrNull = sanitize(value)

      if (valueOrNull == null) {
        return null
      }

      value = valueOrNull
    }

    // Validation Phase

    if (minimum != null && value < minimum) {
      return handleError({
        code: 'minimum',
        originalValue: unknownValue,
        value,
        ast,
        config
      })
    }

    if (maximum != null && value > maximum) {
      return handleError({
        code: 'maximum',
        originalValue: unknownValue,
        value,
        ast,
        config
      })
    }

    if (validate && !validate(value)) {
      return handleError({
        code: 'validate',
        originalValue: unknownValue,
        value,
        ast,
        config
      })
    }

    return value as any
  }

  return new GraphQLScalarType({
    ...scalarConfig,
    serialize: serialize || defaultSerialize,
    parseValue,
    parseLiteral: (ast): TInternal | null =>
      parseValue(getValueFromValueNode(ast), ast)
  })
}
