import {
  ACCOUNT_PAGE_OPEN_NAME,
  HOME_PAGE_NAME,
  resolveMeheryPageOpenName,
  resolveOwnedMeheryPageOpen,
} from '../pageOpenConstants'

describe('resolveMeheryPageOpenName', () => {
  it('maps home routes and titles to home', () => {
    expect(HOME_PAGE_NAME).toBe('home')
    expect(resolveMeheryPageOpenName('home')).toBe('home')
    expect(resolveMeheryPageOpenName('Home')).toBe('home')
    expect(resolveMeheryPageOpenName('homeTabs')).toBe('home')
  })

  it('maps account / profile routes to account', () => {
    expect(ACCOUNT_PAGE_OPEN_NAME).toBe('account')
    expect(resolveMeheryPageOpenName('account')).toBe('account')
    expect(resolveMeheryPageOpenName('Account')).toBe('account')
    expect(resolveMeheryPageOpenName('profile')).toBe('account')
  })

  it('returns null for unrelated screens', () => {
    expect(resolveMeheryPageOpenName('cart')).toBeNull()
    expect(resolveMeheryPageOpenName('products')).toBeNull()
    expect(resolveMeheryPageOpenName(undefined)).toBeNull()
    expect(resolveMeheryPageOpenName('')).toBeNull()
  })
})

describe('resolveOwnedMeheryPageOpen', () => {
  it('does not attribute Search Suggestions to the home tab', () => {
    expect(
      resolveOwnedMeheryPageOpen({
        routeName: 'Search Suggestions',
        activeTab: 'home',
      })
    ).toBeNull()
  })

  it('uses activeTab only on the tab shell', () => {
    expect(
      resolveOwnedMeheryPageOpen({
        routeName: '',
        activeTab: 'account',
      })
    ).toBe('account')
  })

  it('prefers the focused route when it is owned', () => {
    expect(
      resolveOwnedMeheryPageOpen({
        routeName: 'account',
        activeTab: 'home',
      })
    ).toBe('account')
  })

  it('maps account and profile to the same page (no re-open flicker)', () => {
    expect(
      resolveOwnedMeheryPageOpen({
        routeName: 'account',
        activeTab: 'account',
      })
    ).toBe(
      resolveOwnedMeheryPageOpen({
        routeName: 'profile',
        activeTab: 'account',
      })
    )
  })
})
