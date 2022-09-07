import type { JSONSchemaLoaderOptions } from "@omnigraph/json-schema";
import type { OpenAPIV3, OpenAPIV2 } from 'openapi-types';

export interface OpenAPILoaderOptions extends Partial<JSONSchemaLoaderOptions> {
    source: OpenAPIV3.Document;
    selectQueryOrMutationField?: OpenAPILoaderSelectQueryOrMutationFieldConfig[];
  }

export interface OpenAPILoaderSelectQueryOrMutationFieldConfig {
    type: 'query' | 'mutation';
    fieldName: string;
  }