/** The PDF's name in Drive and as an email attachment; sorts by month. Pure. */
export function salesReportFileName(report) {
  const partial = report.partial && report.dataThrough
    ? ` (partial, to ${new Date(`${report.dataThrough}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })})`
    : ''
  return `${report.month} ${report.monthLabel.split(' ')[0]} — LoveLab sales report${partial}.pdf`
}
