import { Converter } from './converter.js'
import { NumberConverter } from './numberConverter.js'
import { TextConverter } from './textConverter.js'
import { SelectConverter } from './selectConverter.js'
import { ValueConverter } from './valueconverter.js'
import { Ientity, Converters } from '../shared/specification/index.js'
import { BinaryConverter } from './binaryConverter.js'

export class ConverterMap extends Map<Converters, Converter> {
  private static converterMap = new ConverterMap()
  private static getConverterMap(): ConverterMap {
    return ConverterMap.converterMap
  }

  static getConverters(): Converters[] {
    const rc: Converters[] = []
    ConverterMap.getConverterMap().forEach((con, name) => {
      rc.push(name)
    })
    return rc
  }

  static getConverter(entity: Ientity): Converter | undefined {
    let cv: Converter | undefined = undefined
    if (entity.converter) cv = ConverterMap.getConverterMap().get(entity.converter)
    return cv
  }
  private static _initialize = (() => {
    if (ConverterMap.converterMap.size == 0) {
      // read/write not a sensor
      ConverterMap.converterMap.set('number', new NumberConverter())
      ConverterMap.converterMap.set('select', new SelectConverter())
      ConverterMap.converterMap.set('text', new TextConverter())
      ConverterMap.converterMap.set('binary', new BinaryConverter())
      ConverterMap.converterMap.set('value', new ValueConverter())
    }
  })()
}
