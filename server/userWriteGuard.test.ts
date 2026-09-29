import { describe, expect, it } from 'vitest'
import { guardUserWrite } from './userWriteGuard'

describe('guardUserWrite', () => {
  it('keeps a tenant on their existing role, agency, and verification', () => {
    const guarded = guardUserWrite({
      actorRole: 'tenant',
      existing: {
        role: 'END_USER',
        clientId: 'client-1',
        active: true,
        metadata: {
          frontend_role: 'tenant',
          enabledPermissions: ['portal.tenant'],
          verification: { status: 'not_required' },
        },
      },
      requestedFrontendRole: 'super_admin',
      requestedClientId: 'client-other',
      requestedActive: false,
      metadata: {
        frontend_id: 'u-1',
        frontend_role: 'super_admin',
        enabledPermissions: ['platform.manage'],
        verification: { status: 'approved', documents: [{ name: 'id.pdf' }] },
      },
    })
    expect(guarded.dbRole).toBe('END_USER')
    expect(guarded.frontendRole).toBe('tenant')
    expect(guarded.clientId).toBe('client-1')
    expect(guarded.active).toBe(true)
    expect(guarded.metadata.frontend_role).toBe('tenant')
    expect(guarded.metadata.enabledPermissions).toEqual(['portal.tenant'])
    expect(guarded.metadata.verification).toEqual({ status: 'not_required' })
  })

  it('blocks a principal from creating a super admin', () => {
    expect(() =>
      guardUserWrite({
        actorRole: 'client_admin',
        existing: null,
        requestedFrontendRole: 'super_admin',
        requestedClientId: null,
        requestedActive: true,
        metadata: { frontend_id: 'u-new' },
      }),
    ).toThrow(/super admin/i)
  })

  it('lets a super admin grant another role', () => {
    const guarded = guardUserWrite({
      actorRole: 'super_admin',
      existing: {
        role: 'END_USER',
        clientId: null,
        active: true,
        metadata: { frontend_role: 'tenant' },
      },
      requestedFrontendRole: 'client_admin',
      requestedClientId: 'client-1',
      requestedActive: true,
      metadata: { frontend_id: 'u-2', frontend_role: 'client_admin' },
    })
    expect(guarded.dbRole).toBe('AGENCY_ADMIN')
    expect(guarded.clientId).toBe('client-1')
  })

  it('lets a pending user attach documents without changing status', () => {
    const guarded = guardUserWrite({
      actorRole: 'landlord',
      existing: {
        role: 'LANDLORD',
        clientId: 'client-1',
        active: true,
        metadata: {
          frontend_role: 'landlord',
          verification: { status: 'pending', documents: [] },
        },
      },
      requestedFrontendRole: 'super_admin',
      requestedClientId: 'client-other',
      requestedActive: false,
      metadata: {
        frontend_id: 'u-ll',
        verification: {
          status: 'pending',
          documents: [{ key: 'id_copy', name: 'id.pdf', dataUrl: 'pfstore:v1:file-1' }],
        },
      },
    })
    expect(guarded.dbRole).toBe('LANDLORD')
    expect(guarded.clientId).toBe('client-1')
    expect(guarded.metadata.verification).toMatchObject({
      status: 'pending',
      documents: [{ key: 'id_copy', name: 'id.pdf', dataUrl: 'pfstore:v1:file-1' }],
    })
  })

  it('does not let a pending user self-approve by rewriting verification', () => {
    const guarded = guardUserWrite({
      actorRole: 'landlord',
      existing: {
        role: 'LANDLORD',
        clientId: 'client-1',
        active: true,
        metadata: { frontend_role: 'landlord', verification: { status: 'pending' } },
      },
      requestedFrontendRole: 'landlord',
      requestedClientId: 'client-1',
      requestedActive: true,
      metadata: {
        frontend_id: 'u-ll',
        verification: { status: 'approved', documents: [{ name: 'id.pdf' }] },
      },
    })
    expect(guarded.metadata.verification).toEqual({ status: 'pending' })
  })

  it('does not let a new unprivileged row self-approve', () => {
    const guarded = guardUserWrite({
      actorRole: 'landlord',
      existing: null,
      requestedFrontendRole: 'landlord',
      requestedClientId: 'client-1',
      requestedActive: true,
      metadata: { frontend_id: 'u-3', verification: { status: 'approved' } },
    })
    expect((guarded.metadata.verification as { status: string }).status).toBe('pending')
  })
})