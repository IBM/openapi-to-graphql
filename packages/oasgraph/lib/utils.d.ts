import { PreprocessingData } from './types/preprocessing_data'
import { Warning } from './types/options'
export declare const WarningTypes: {
  [key: string]: (culprit: string, solution: string) => Warning
}
/**
 * Utilities that are specific to OASGraph
 */
export declare function handleWarning({
  typeKey,
  culprit,
  solution,
  data,
  log
}: {
  typeKey: string
  culprit: string
  solution?: string
  data: PreprocessingData
  log?: Function
}): void
export declare function sortObject(o: any): {}
/**
 * Finds the common property names between two objects
 */
export declare function getCommonPropertyNames(
  object1: any,
  object2: any
): string[]
