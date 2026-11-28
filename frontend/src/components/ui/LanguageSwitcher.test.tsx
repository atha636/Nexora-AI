import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleProvider, useT } from '../../i18n'
import { setLang } from '../../i18n/core'
import { LanguageSwitcher } from './LanguageSwitcher'

function Probe() {
  const { t } = useT()
  return <p>{t('nav.dashboard')}</p>
}

afterEach(() => setLang('en'))

describe('LanguageSwitcher', () => {
  it('switches the whole app to Hindi and back, and remembers it', async () => {
    render(
      <LocaleProvider>
        <LanguageSwitcher />
        <Probe />
      </LocaleProvider>,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /switch language/i }))
    expect(screen.getByText('डैशबोर्ड')).toBeInTheDocument()
    expect(localStorage.getItem('nexora-lang')).toBe('hi')
    expect(document.documentElement.lang).toBe('hi')
    await userEvent.click(screen.getByRole('button', { name: /भाषा बदलें/ }))
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})