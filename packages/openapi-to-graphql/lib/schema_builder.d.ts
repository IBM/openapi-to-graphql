import { GraphQLInputType, GraphQLOutputType } from 'graphql';
import { Args } from './types/graphql';
import { ParameterObject } from './types/oas3';
import { DataDefinition, Operation } from './types/operation';
import { PreprocessingData } from './types/preprocessing_data';
declare type GetArgsParams<TSource, TContext, TArgs> = {
    requestPayloadDef?: DataDefinition;
    parameters: ParameterObject[];
    operation?: Operation;
    data: PreprocessingData<TSource, TContext, TArgs>;
};
declare type CreateOrReuseComplexTypeParams<TSource, TContext, TArgs> = {
    def: DataDefinition;
    operation?: Operation;
    iteration?: number;
    isInputObjectType?: boolean;
    data: PreprocessingData<TSource, TContext, TArgs>;
};
/**
 * Creates and returns a GraphQL type for the given JSON schema.
 */
export declare function getGraphQLType<TSource, TContext, TArgs>({ def, operation, data, iteration, isInputObjectType }: CreateOrReuseComplexTypeParams<TSource, TContext, TArgs>): GraphQLOutputType | GraphQLInputType;
/**
 * Creates the arguments for resolving a field
 *
 * Arguments that are provided via options will be ignored
 */
export declare function getArgs<TSource, TContext, TArgs>({ requestPayloadDef, parameters, operation, data }: GetArgsParams<TSource, TContext, TArgs>): Args;
export {};
