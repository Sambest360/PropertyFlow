import type { PropertyAsset } from '../types/domain'

/**
 * Build a property persist body that never re-submits an inferred type guess.
 * When the listing is still inferred and the patch did not choose a type, omit
 * `type` so the server leaves units.property_type null (AV3-3 / F4).
 */
export function propertyPersistPayload(
  prev: Pick<PropertyAsset, 'id' | 'type' | 'typeInferred'> & Record<string, unknown>,
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  const { type: prevType, typeInferred: prevTypeInferred, ...prevRest } = prev
  const patchType = patch.type
  const patchChose =
    patchType !== undefined && patchType !== null && String(patchType).trim() !== ''
  if (patchChose) {
    const { type: _omit, ...restPatch } = patch
    return { ...prevRest, ...restPatch, type: patchType, id: prev.id }
  }
  const { type: _omitEmpty, ...restPatch } = patch
  return {
    ...prevRest,
    ...restPatch,
    id: prev.id,
    ...(prevTypeInferred ? {} : prevType ? { type: prevType } : {}),
  }
}
