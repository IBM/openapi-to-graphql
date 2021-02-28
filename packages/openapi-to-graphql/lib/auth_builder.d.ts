/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OpenAPI-to-GraphQL.
 */
import { GraphQLFieldConfig } from 'graphql';
import { GraphQLOperationType } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
export declare function createAndLoadViewer<TSource, TContext, TArgs>(queryFields: object, operationType: GraphQLOperationType, data: PreprocessingData<TSource, TContext, TArgs>): {
    [key: string]: GraphQLFieldConfig<TSource, TContext, TArgs>;
};
