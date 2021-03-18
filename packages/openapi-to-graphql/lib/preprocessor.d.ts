import * as Oas3Tools from './oas_3_tools';
import { LinkObject, Oas3, SchemaObject } from './types/oas3';
import { DataDefinition } from './types/operation';
import { InternalOptions } from './types/options';
import { PreprocessingData } from './types/preprocessing_data';
/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OpenAPI-to-GraphQL to use
 */
export declare function preprocessOas<TSource, TContext, TArgs>(oass: Oas3[], options: InternalOptions<TSource, TContext, TArgs>): PreprocessingData<TSource, TContext, TArgs>;
/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition.
 */
export declare function createDataDef<TSource, TContext, TArgs>(names: Oas3Tools.SchemaNames, schema: SchemaObject, isInputObjectType: boolean, data: PreprocessingData<TSource, TContext, TArgs>, oas: Oas3, links?: {
    [key: string]: LinkObject;
}): DataDefinition;
