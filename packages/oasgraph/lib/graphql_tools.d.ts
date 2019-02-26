/**
 * Utilities related to GraphQL.
 */
import { GraphQLObjectType as GQObjectType, GraphQLInputObjectType as GQInputObjectType } from 'graphql';
/**
 * Returns empty GraphQLObjectType.
 */
export declare function getEmptyObjectType(name: string): GQObjectType;
/**
 * Returns empty GraphQLInputObjectType.
 */
export declare function getEmptyInputObjectType(): GQInputObjectType;
