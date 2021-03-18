import { GraphQLSchema } from 'graphql';
import { Oas2 } from './types/oas2';
import { Oas3 } from './types/oas3';
import { Options, Report } from './types/options';
import { PreprocessingData } from './types/preprocessing_data';
declare type Result<TSource, TContext, TArgs> = {
    schema: GraphQLSchema;
    report: Report;
    data: PreprocessingData<TSource, TContext, TArgs>;
};
/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
export declare function createGraphQLSchema<TSource, TContext, TArgs>(spec: Oas3 | Oas2 | (Oas3 | Oas2)[], options?: Options<TSource, TContext, TArgs>): Promise<Result<TSource, TContext, TArgs>>;
export { CaseStyle, sanitize } from './oas_3_tools';
export { GraphQLOperationType } from './types/graphql';
