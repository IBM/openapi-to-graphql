import { ValueNode } from 'graphql'

export interface IScalarParseError<TConfig, TCode = string> {
  code: TCode
  originalValue: unknown
  value: unknown
  ast?: ValueNode
  config: TConfig
}

// function type may throw an error

export type ScalarParseErrorHandler<TInternal, TConfig, TCode = string> = (
  errorInfo: IScalarParseError<TConfig, TCode>
) => TInternal

// coerce raw external input value into internal value

type ScalarCoerceFunction<T> = (raw: unknown) => T | null | undefined

type ScalarSanitizeFunction<T> = (value: T) => T | null | undefined

type ScalarValidateFunction<T> = (value: T) => boolean

type ScalarParseFunction<T, U> = (value: T) => U

type ScalarSerializeFunction<T, U> = (value: T) => U

interface StrictScalarConfig {
  name: string
  maximum?: number
  minimum?: number
  pattern?: RegExp | string
  maxLength?: number
  minLength?: number
  description?: string
  trim?: boolean
  nonEmpty?: boolean
}

export type CaptilizeForm = 'characters' | 'words' | 'sentences' | 'first'

export type NumberScalarErrorCode = 'type' | 'minimum' | 'maximum' | 'validate'

export type StringScalarErrorCode =
  | 'type'
  | 'empty'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'validate'

export interface StrictScalarNumberConfig extends StrictScalarConfig {
  errorHandler?: ScalarParseErrorHandler<number, number>
  serialize?: ScalarSerializeFunction<number, number>
  parse?: ScalarParseFunction<number, number>
  coerce?: ScalarCoerceFunction<number>
  sanitize?: ScalarSanitizeFunction<number>
  validate?: ScalarValidateFunction<number>
}

export interface StrictScalarStringConfig extends StrictScalarConfig {
  maxEmptyLines?: number
  capitalize?: CaptilizeForm
  collapseWhitespace?: boolean
  truncate?: number
  uppercase?: boolean
  lowercase?: boolean
  singleline?: string
  errorHandler?: ScalarParseErrorHandler<string, string>
  serialize?: ScalarSerializeFunction<string, string>
  parse?: ScalarParseFunction<string, string>
  coerce?: ScalarCoerceFunction<string>
  sanitize?: ScalarSanitizeFunction<string>
  validate?: ScalarValidateFunction<string>
}
