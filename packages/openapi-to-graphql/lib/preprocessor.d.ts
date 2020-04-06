import { Oas3, LinkObject, SchemaObject } from './types/oas3';
import { InternalOptions } from './types/options';
import { DataDefinition } from './types/operation';
import { PreprocessingData } from './types/preprocessing_data';
import * as Oas3Tools from './oas_3_tools';
/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OpenAPI-to-GraphQL to use
 */
export declare function preprocessOas(oass: Oas3[], options: InternalOptions): PreprocessingData;
/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for object types), and an iotName
 * (= String to use as the name for input object types). Eventually, data
 * definitions also hold an ot (= the object type for the schema) and an iot
 * (= the input object type for the schema).
 *
 * Either names or preferredName should exist.
 */
export declare function createDataDef(names: Oas3Tools.SchemaNames, schema: SchemaObject, isInputObjectType: boolean, data: PreprocessingData, links?: {
    [key: string]: LinkObject;
}, oas?: Oas3): DataDefinition;
