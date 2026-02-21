import { Request } from 'express'
import * as multer from 'multer'
import * as fs from 'fs'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

export const zipStorage = multer.diskStorage({
  destination: (request: Request, _file: Express.Multer.File, callback: DestinationCallback): void => {
    callback(null, fs.mkdtempSync('zip'))
  },
  filename: (_req: Request, file: Express.Multer.File, callback: FileNameCallback): void => {
    callback(null, file.originalname)
  },
})
