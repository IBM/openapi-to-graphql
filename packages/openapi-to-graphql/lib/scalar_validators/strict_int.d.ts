import { GraphQLScalarType } from 'graphql';
import { StrictScalarNumberConfig } from '../types/strict_scalars';
export declare const createIntScalar: <TInternal = string, TExternal = string>(config: StrictScalarNumberConfig) => GraphQLScalarType;
