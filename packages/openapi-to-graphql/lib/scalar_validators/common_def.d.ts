import { ValueNode } from 'graphql';
import { ScalarParseErrorHandler } from '../types/strict_scalars';
export declare const defaultErrorHandler: ScalarParseErrorHandler<any, any>;
export declare const defaultSerialize: (x: any) => any;
export declare const getValueFromValueNode: (ast: ValueNode) => any;
