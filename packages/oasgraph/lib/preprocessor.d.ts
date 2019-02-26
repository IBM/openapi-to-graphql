import { Oas3, SchemaObject } from './types/oas3';
import { InternalOptions } from './types/options';
import { DataDefinition } from './types/operation';
import { PreprocessingData } from './types/preprocessing_data';
import * as Oas3Tools from './oas_3_tools';
/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OASGraph to use
 */
export declare function preprocessOas(oas: Oas3, options: InternalOptions): PreprocessingData;
/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for Object Types), and an iotName
 * (= String to use as the name for Input Object Types). Eventually, data
 * definitions also hold an ot (= the Object Type for the schema) and an iot
 * (= the Input Object Type for the schema).
 */
export declare function createOrReuseDataDef(data: PreprocessingData, schema?: SchemaObject, names?: Oas3Tools.SchemaNames): DataDefinition;
