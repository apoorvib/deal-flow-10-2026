export class ApiError extends Error {
  status: number
  /** The endpoint doesn't exist on this backend. */
  unavailable: boolean
  constructor(status: number, message: string, unavailable = false) {
    super(message)
    this.status = status
    this.unavailable = unavailable
  }
}
