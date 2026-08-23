/**
 * ResourcesCard tests — focused on the EAN Codes folder addition.
 *
 * Guarantees:
 *   - The Documents pane (with download folders) only renders for admins.
 *   - The new "EAN Codes" folder is listed for admins.
 *   - The folder, when expanded, exposes a download link to the GS1 file.
 *   - Selecting the EAN file flips on the email button.
 */

import { render, screen, fireEvent } from '@testing-library/react'

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key) => {
      const map = {
        'resources.documents': 'Documents',
        'resources.catalogue': 'Catalogue',
        'resources.packs': 'Packs',
        'resources.priceList': 'Price List',
        'resources.igi': 'IGI',
        'resources.eanCodes': 'EAN Codes',
        'resources.brandDocuments': 'Brand Documents',
        'resources.sendByEmail': 'Send 1 file by email',
        'resources.sendByEmailPlural': 'Send 2 files by email',
      }
      return map[key] || key
    },
  }),
}))

// SendResourcesModal pulls in browser-only stuff we don't need to exercise here.
jest.mock('../SendResourcesModal', () => ({
  __esModule: true,
  default: () => null,
}))

import ResourcesCard from '../ResourcesCard'

const FRENCH_LINKS = {
  generalSept: 'https://www.canva.com/design/DAHPPy7GKXc/fzRUgvGrbqq5jf1DJ_DcTQ/view?embed',
  bijorkaSept: 'https://www.canva.com/design/DAHPPw_T2xI/Z_Tyy6Lp6OWkBRy1x5dCOg/view?embed',
  premiereFrance: 'https://www.canva.com/design/DAG8QTSZGDA/00BwwxPy9ZTg_g18XWm9EQ/view?embed',
  premiereGeneral: 'https://www.canva.com/design/DAHPP8Z87Jw/ke6GNZN7sohPEteltgMNQw/view?embed',
}

const FRENCH_PDFS = {
  generalSept: '/catalogues/Francais/Sept%20Fr%20LoveLab%20B2B%20Catalogue%20General%20(210%20x%20210%20mm).pdf',
  bijorkaSept: '/catalogues/Francais/Sept%20Fr%20LoveLab%20B2B%20Catalogue%20(210%20x%20210%20mm).pdf',
  premiereFrance: '/catalogues/Francais/_Oct%20FR_LoveLab_B2B_Catalogue%20(210%20x%20210%20mm).pdf',
  premiereGeneral: '/catalogues/Francais/Oct%20FR_LoveLab_B2B_Catalogue%20General%20(210%20x%20210%20mm).pdf',
}

describe('ResourcesCard — EAN Codes folder', () => {
  it('does not render the document folders for non-admins', () => {
    render(<ResourcesCard isAdmin={false} />)
    expect(screen.queryByText('EAN Codes')).not.toBeInTheDocument()
    expect(screen.queryByText('Catalogue')).not.toBeInTheDocument()
    expect(screen.queryByText('Brand Documents')).not.toBeInTheDocument()
    // Price lists are wholesale documents — no agent downloads or emails them,
    // Piotr included. Only the builder's price list toggle is per-agent.
    expect(screen.queryByText('Price List')).not.toBeInTheDocument()
  })

  it('does not render the price list folder for Piotr either', () => {
    render(<ResourcesCard isAdmin={false} userEmail="piotr.kicinski84@gmail.com" />)
    expect(screen.queryByText('Price List')).not.toBeInTheDocument()
    expect(screen.queryByText('Pricelist_LoveLab_2026_October.pdf')).not.toBeInTheDocument()
  })

  it('renders the EAN Codes folder for admins', () => {
    render(<ResourcesCard isAdmin={true} />)
    expect(screen.getByText('EAN Codes')).toBeInTheDocument()
  })

  it('exposes the GS1 file with a correct download link when expanded', () => {
    render(<ResourcesCard isAdmin={true} />)
    fireEvent.click(screen.getByText('EAN Codes'))
    const link = screen.getByText('Final-GS1-Code.xlsx').closest('a')
    expect(link).not.toBeNull()
    // Encoded spaces so the browser / email fetcher do not 404 on the path.
    expect(link.getAttribute('href')).toBe('/Ean%20Codes/Final-GS1-Code.xlsx')
    expect(link.getAttribute('download')).toBe('Final-GS1-Code.xlsx')
  })

  it('toggles the email button on when the EAN file is selected', () => {
    render(<ResourcesCard isAdmin={true} />)
    fireEvent.click(screen.getByText('EAN Codes'))
    // No "Send … by email" button before any selection.
    expect(screen.queryByText(/Send .* by email/i)).not.toBeInTheDocument()

    const checkbox = screen.getByLabelText('Select Final-GS1-Code.xlsx')
    fireEvent.click(checkbox)

    expect(screen.getByText(/Send 1 file by email/i)).toBeInTheDocument()
  })
})

describe('ResourcesCard — IGI folder', () => {
  it('renders the IGI folder for admins, next to Catalogue', () => {
    render(<ResourcesCard isAdmin={true} />)
    expect(screen.getByText('IGI')).toBeInTheDocument()
    expect(screen.getByText('Catalogue')).toBeInTheDocument()
  })

  it('does not render the IGI folder for non-admins', () => {
    render(<ResourcesCard isAdmin={false} />)
    expect(screen.queryByText('IGI')).not.toBeInTheDocument()
  })

  it('lists the IGI Excel with a correct download link when expanded', () => {
    render(<ResourcesCard isAdmin={true} />)
    fireEvent.click(screen.getByText('IGI'))
    const link = screen.getByText('IGI_ORDERS_FILL.xlsx').closest('a')
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('/IGI%20Excel/IGI_ORDERS_FILL.xlsx')
    expect(link.getAttribute('download')).toBe('IGI_ORDERS_FILL.xlsx')
  })

  it('toggles the email button on when the IGI file is selected', () => {
    render(<ResourcesCard isAdmin={true} />)
    fireEvent.click(screen.getByText('IGI'))
    expect(screen.queryByText(/Send .* by email/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Select IGI_ORDERS_FILL.xlsx'))
    expect(screen.getByText(/Send 1 file by email/i)).toBeInTheDocument()
  })
})

describe('ResourcesCard — role-aware catalogue access', () => {
  const SHOWROOM_ORG = '171e2660-88f9-4677-a346-72d7c71462e9'
  const optionNames = () => screen.queryAllByRole('option').map((option) => option.textContent)

  it('shows no catalogue preview to an unassigned agent', () => {
    render(<ResourcesCard isAdmin={false} userEmail="agent@example.com" />)
    expect(screen.queryByLabelText('Catalogue preview')).not.toBeInTheDocument()
  })

  it('shows Sarah’s organization the September and October non-General French catalogues', () => {
    render(<ResourcesCard isAdmin={false} userEmail="wassila@showroomaccestory.com" organizationId={SHOWROOM_ORG} />)
    expect(optionNames()).toEqual([
      'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
      '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    ])
  })

  it('does not grant Sarah’s catalogues from a lookalike email without membership', () => {
    render(<ResourcesCard isAdmin={false} userEmail="outsider@showroomaccestory.com" organizationId="other-org" />)
    expect(screen.queryByLabelText('Catalogue preview')).not.toBeInTheDocument()
  })

  it('shows Nicolas the September and October General French catalogues', () => {
    render(<ResourcesCard isAdmin={false} userEmail="NICOLAS.VIAL@ASCENSION-FRANCE.COM" />)
    expect(optionNames()).toEqual([
      'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
      'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    ])
  })

  it('shows Piotr only October English and Polish', () => {
    render(<ResourcesCard isAdmin={false} userEmail="piotr.kicinski84@gmail.com" />)
    expect(optionNames()).toEqual([
      'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
      'Oct PL_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    ])
  })

  it('shows Bastian only October English and German', () => {
    render(<ResourcesCard isAdmin={false} userEmail="bastianmeyer319@hotmail.com" />)
    expect(optionNames()).toEqual([
      'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
      'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    ])
  })

  it('shows admins all eight retained catalogues, including admin-only Greek', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    expect(optionNames()).toHaveLength(8)
    expect(optionNames()).toContain('Oct GR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf')
    expect(optionNames()).not.toContain('EN_LoveLab_B2B_Catalogue.pdf')
  })

  it('gives the Samuel commercial assistant the same eight catalogues as admins', () => {
    render(<ResourcesCard isAdmin={false} userEmail="SAMUEL@LOVE-LAB.COM" />)
    expect(optionNames()).toHaveLength(8)
    expect(optionNames()).toContain('Oct GR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf')
    expect(optionNames()).toContain('Oct PL_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf')
  })

  test.each([
    ['fr-general-sept', 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf', FRENCH_LINKS.generalSept, FRENCH_PDFS.generalSept],
    ['fr-bijorka-sept', 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf', FRENCH_LINKS.bijorkaSept, FRENCH_PDFS.bijorkaSept],
    ['fr-premiere-france-oct', '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf', FRENCH_LINKS.premiereFrance, FRENCH_PDFS.premiereFrance],
    ['fr-premiere-general-oct', 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf', FRENCH_LINKS.premiereGeneral, FRENCH_PDFS.premiereGeneral],
    ['en-oct', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf', 'https://www.canva.com/design/DAHPRGqBzAM/SfktKLBglSZg6NRcaJUVPQ/view?embed', '/catalogues/English/Oct%20EN_LoveLab_B2B_Catalogue%20(210%20x%20210%20mm).pdf'],
    ['de-oct', 'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf', 'https://www.canva.com/design/DAHPRJuRdEE/1afvONAix_iVpw1g-amYpA/view?embed', '/catalogues/Oct%20DE_LoveLab_B2B_Catalogue%20General%20(210%20x%20210%20mm).pdf'],
    ['pl-oct', 'Oct PL_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf', 'https://www.canva.com/design/DAHQGQ1u494/hPqGe37Hk1ARHkoXuLc6JA/view?embed', '/catalogues/Oct%20PL_LoveLab_B2B_Catalogue%20General%20(210%20x%20210%20mm).pdf'],
    ['gr-oct', 'Oct GR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf', 'https://www.canva.com/design/DAHQGQ87t08/QA0XcMNgmBtRNhcIzVlhOA/view?embed', '/catalogues/Oct%20GR_LoveLab_B2B_Catalogue%20General%20(210%20x%20210%20mm).pdf'],
  ])('keeps the %s Canva preview paired with its PDF', (id, label, canva, pdf) => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.change(screen.getByLabelText('Catalogue preview'), { target: { value: id } })
    expect(screen.getByTitle(`Catalogue preview: ${label}`).getAttribute('src')).toBe(canva)
    expect(screen.getByRole('link', { name: 'Download PDF' }).getAttribute('href')).toBe(pdf)
  })

  it('lists all eight retained PDFs in the admin catalogue folder', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Catalogue'))
    const checkboxes = screen.getAllByRole('checkbox', { name: /^Select .*Catalogue.*\.pdf$/ })
    expect(checkboxes).toHaveLength(8)
    expect(screen.queryByText('EN — LoveLab B2B Catalogue.pdf')).not.toBeInTheDocument()
  })
})

describe('ResourcesCard — Brand Documents folder', () => {
  it('renders Brand Documents for admins only', () => {
    const { rerender } = render(<ResourcesCard isAdmin={false} userEmail="agent@example.com" />)
    expect(screen.queryByText('Brand Documents')).not.toBeInTheDocument()

    rerender(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    expect(screen.getByText('Brand Documents')).toBeInTheDocument()
  })

  it('lists French and English brand presentations with encoded download hrefs', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Brand Documents'))

    const fr = screen.getByText('LoveLab Brand Presentation — French.pdf').closest('a')
    const en = screen.getByText('LoveLab Brand Presentation — English.pdf').closest('a')

    expect(fr.getAttribute('href')).toBe(
      '/BRAND%20PRESENTATION%20DOCS/LoveLab_Presentation_Marque_FR.pdf',
    )
    expect(en.getAttribute('href')).toBe(
      '/BRAND%20PRESENTATION%20DOCS/LoveLab_Brand_Presentation_General_EN.pdf',
    )
    expect(fr.getAttribute('download')).toBe('LoveLab Brand Presentation — French.pdf')
    expect(en.getAttribute('download')).toBe('LoveLab Brand Presentation — English.pdf')
  })

  it('enables send-by-email when a brand document is selected', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Brand Documents'))

    fireEvent.click(screen.getByLabelText('Select LoveLab Brand Presentation — French.pdf'))
    expect(screen.getByText(/Send 1 file by email/i)).toBeInTheDocument()
  })
})

describe('ResourcesCard — Price List folder', () => {
  it('lists all three price lists with encoded download hrefs', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Price List'))

    const link = (fileName) => screen.getAllByText(fileName)
      .map((element) => element.closest('a'))
      .find(Boolean)

    expect(link('Pricelist_LoveLab_2025.pdf').getAttribute('href'))
      .toBe('/Price%20Lists/Pricelist_LoveLab_2025.pdf')
    expect(link('Pricelist_LoveLab_2026.pdf').getAttribute('href'))
      .toBe('/Price%20Lists/Pricelist_LoveLab_2026.pdf')
    expect(link('Pricelist_LoveLab_2026_October.pdf').getAttribute('href'))
      .toBe('/Price%20Lists/Pricelist_LoveLab_2026_October.pdf')
  })

  it('can email the October price list to a client', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Price List'))

    fireEvent.click(screen.getByLabelText('Select Pricelist_LoveLab_2026_October.pdf'))
    expect(screen.getByText(/Send 1 file by email/i)).toBeInTheDocument()
  })
})
