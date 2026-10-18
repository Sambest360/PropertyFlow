/** Thrown when createPropertyBundle persisted the unit but a later step failed. */
export class CreatePropertyBundleError extends Error {
  readonly propertyId: string
  readonly partial = true

  constructor(propertyId: string, message?: string) {
    super(message ?? 'Could not finish saving the listing. Try again.')
    this.name = 'CreatePropertyBundleError'
    this.propertyId = propertyId
  }
}

export function propertyIdFromCreateError(err: unknown): string | null {
  if (err instanceof CreatePropertyBundleError) return err.propertyId
  if (err && typeof err === 'object' && 'propertyId' in err) {
    const id = (err as { propertyId?: unknown }).propertyId
    return typeof id === 'string' && id ? id : null
  }
  return null
}
