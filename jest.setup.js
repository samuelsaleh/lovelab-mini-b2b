import '@testing-library/jest-dom'
import { setHideRevenue } from '@/lib/utils'

afterEach(() => {
  setHideRevenue(false)
})
