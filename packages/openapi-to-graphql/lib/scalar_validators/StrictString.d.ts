import { GraphQLScalarType } from 'graphql';
import { StrictScalarStringConfig } from '../types/strict_scalars';
export declare const createStringScalar: <TInternal = string, TExternal = string>(config: StrictScalarStringConfig) => GraphQLScalarType;
