/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OpenAPI-to-GraphQL.
 */
import { GraphQLObjectType, GraphQLFieldResolver } from 'graphql';
import { Args, GraphQLOperationType } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
declare type Viewer<TSource, TContext, TArgs> = {
    type: GraphQLObjectType;
    resolve: GraphQLFieldResolver<TSource, TContext, TArgs>;
    args: Args;
    description: string;
};
/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
export declare function createAndLoadViewer<TSource, TContext, TArgs>(queryFields: object, operationType: GraphQLOperationType, data: PreprocessingData<TSource, TContext, TArgs>): {
    [key: string]: Viewer<TSource, TContext, TArgs>;
};
export {};
