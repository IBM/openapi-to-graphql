import {
  BooleanValueNode,
  EnumValueNode,
  FloatValueNode,
  IntValueNode,
  Kind,
  StringValueNode,
  ValueNode
} from 'graphql'

import { GraphQLError } from 'graphql'

import { ScalarParseErrorHandler } from '../types/strict_scalars'

export const defaultErrorHandler: ScalarParseErrorHandler<any, any> = ({
  code,
  ast
}): never => {
  throw new GraphQLError(`code=${code}`, ast ? [ast] : [])
}

export const defaultSerialize = (x: any): any => x

export const getValueFromValueNode = (ast: ValueNode): any => {
  switch (ast.kind) {
    case Kind.BOOLEAN:
      return (ast as BooleanValueNode).value
    case Kind.FLOAT:
      return parseFloat((ast as FloatValueNode).value)
    case Kind.INT:
      return parseInt((ast as IntValueNode).value, 10)
    case Kind.NULL:
      return null
    case Kind.STRING:
      return (ast as StringValueNode).value
    case Kind.ENUM:
      return (ast as EnumValueNode).value
  }
  return undefined
}
