// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useProfile } from './use-profile'

const profile = { id: '100000000000000021', username: 'santiago', displayName: 'Santiago', avatarUrl: null }
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

it('caches an explicitly selected profile and keeps it after a refresh failure', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ profile: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profile })))
    .mockRejectedValueOnce(new Error('Offline'))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => useProfile())
  await waitFor(() => expect(result.current.pending).toBe(false))
  await act(() => result.current.connect(profile.id))
  expect(result.current.profile).toEqual(profile)
  expect(JSON.parse(localStorage.getItem('threaddeck:profile')!).selection).toBe(profile.id)
  await act(() => result.current.refresh())
  expect(result.current.profile).toEqual(profile)
  expect(result.current.error).toBe('Offline')
})

it('does not restore a late Discord response after switching to a local profile', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const { result } = renderHook(() => useProfile())
  await act(() => result.current.useLocal())
  await act(async () => { finish(new Response(JSON.stringify({ profile }))) })
  expect(result.current.profile).toBeNull()
  expect(result.current.selection).toBe('local')
  expect(result.current.pending).toBe(false)
})

it('rejects mismatched identities and untrusted avatar hosts without replacing the cached profile', async () => {
  localStorage.setItem('threaddeck:profile', JSON.stringify({ selection: profile.id, profile }))
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ profile: { ...profile, id: '100000000000000022' } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profile: { ...profile, avatarUrl: 'https://evil.example/avatar.png' } })))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => useProfile())
  await waitFor(() => expect(result.current.pending).toBe(false))
  expect(result.current.error).toContain('different user')
  expect(result.current.profile).toEqual(profile)
  await act(() => result.current.refresh())
  expect(result.current.error).toBeTruthy()
  expect(result.current.profile).toEqual(profile)
})
