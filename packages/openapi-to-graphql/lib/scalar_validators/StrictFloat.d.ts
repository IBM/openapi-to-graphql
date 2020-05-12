import { GraphQLScalarType } from 'graphql';
import { StrictScalarNumberConfig } from '../types/strict_scalars';
export declare const createFloatScalar: <TInternal = string, TExternal = string>(config: StrictScalarNumberConfig) => GraphQLScalarType;
