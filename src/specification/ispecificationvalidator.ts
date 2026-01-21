import { Imessage } from '../shared/specification/index.js'
export interface IvalidateIdentificationResult {
  specname: string
  referencedEntity?: number
}
export interface IspecificationValidator {
  validate(language: string, forContribution: boolean): Imessage[]
  validateUniqueName(language: string): boolean
  validateIdentification(language: string): IvalidateIdentificationResult[]
}
