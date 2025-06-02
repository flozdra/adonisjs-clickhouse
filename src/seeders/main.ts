import { MethodClientContract } from '../types/method.js'

export class BaseSeeder {
  static environment: string[]
  constructor(public client: MethodClientContract) {}

  async run() {}
}
