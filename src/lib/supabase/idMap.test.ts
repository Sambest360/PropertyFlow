import { describe, expect, it } from 'vitest'
import {
  alignActorUserId,
  sessionFrontendUserId,
  EMAIL_TO_USER,
  mapUser,
} from './idMap'
import { buildIdMapCache } from './data'
import { canAccessProperty } from '../agencyScope'

describe('idMap helpers', () => {
  describe('sessionFrontendUserId', () => {
    it('prefers metadata.frontend_id', () => {
      const meta = { frontend_id: 'frontend-123' }
      const email = 'test@example.com'
      expect(sessionFrontendUserId(meta, email)).toBe('frontend-123')
    })

    it('falls back to EMAIL_TO_USER', () => {
      const meta = {} // no frontend_id
      const email = 'fa@x.co'
      EMAIL_TO_USER[email.toLowerCase()] = 'mapped-from-email'
      expect(sessionFrontendUserId(meta, email)).toBe('mapped-from-email')
      // clean up
      delete EMAIL_TO_USER[email.toLowerCase()]
    })

    it('falls back to lowercased email', () => {
      const meta = {}
      const email = 'Fa@X.Co'
      expect(sessionFrontendUserId(meta, email)).toBe('fa@x.co')
    })
  })

  describe('alignActorUserId', () => {
    it('maps UUID user to the actor userId', () => {
      const userIdUuid = '11111111-1111-4111-8111-111111111111'
      const row = {
        id: userIdUuid,
        email: 'fa@x.co',
        metadata: {},
      }
      // Simulate existing map where the UUID maps to a different frontend id
      const userByUuid = new Map<string, string>([[userIdUuid, 'u-other']])
      const users = [row]

      alignActorUserId(userByUuid, users, 'fa@x.co')

      // Now the UUID should map to 'fa@x.co'
      expect(userByUuid.get(userIdUuid)).toBe('fa@x.co')
    })
  })

  describe('mapUser and canAccessProperty integration', () => {
    it('ground_agent can access property when actorId matches', () => {
      const userIdUuid = '11111111-1111-4111-8111-111111111111'
      const row = {
        id: userIdUuid,
        email: 'fa@x.co',
        metadata: {},
      }
      const userByUuid = new Map<string, string>()
      const users = [row]

      // Align the actor userId
      alignActorUserId(userByUuid, users, 'fa@x.co')

      // mapUser works with null cache
      const cache = null

      // mapUser should return the actorId for the given UUID
      const mappedId = mapUser(cache, userByUuid, userIdUuid)
      expect(mappedId).toBe('fa@x.co')

      // Now test canAccessProperty for a ground_agent with that userId
      const viewer = {
        role: 'ground_agent' as const,
        userId: 'fa@x.co',
        agencyId: 'ag-1',
        agencySuspended: false,
      }
      const property = {
        agencyId: 'ag-1',
        agentId: 'fa@x.co', // matches the agentId
        landlordId: null,
      }
      const propertyId = 'p1'

      expect(canAccessProperty(viewer, property, propertyId)).toBe(true)
    })
  })
})