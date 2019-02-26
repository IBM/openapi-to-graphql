/**
 * Custom type definitions for GraphQL.
 */
import { GraphQLObjectType as GQObjectType, GraphQLScalarType, GraphQLInputObjectType as GQInputObjectType, GraphQLList as GQList, GraphQLEnumType as GQEnumType, GraphQLList, GraphQLEnumType } from 'graphql';
export declare type GraphQLType = GQObjectType | GQInputObjectType | GraphQLScalarType | GQList<any> | GQEnumType;
declare type Arg = {
    type: any;
    description?: string;
};
export declare type Args = {
    [key: string]: Arg;
};
export declare type ResolveFunction = (root: Object, args: Object, ctx: Object) => Promise<any> | any;
export declare type Field = {
    type: GQObjectType | GQInputObjectType | GraphQLScalarType | GraphQLList<any> | GraphQLEnumType;
    resolve?: ResolveFunction;
    args?: Args;
    description: string;
};
export {};
