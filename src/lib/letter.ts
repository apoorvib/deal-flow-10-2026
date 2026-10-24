// Example verification letter, generated in the browser as a PDF.
// Every letter carries an EXAMPLE watermark and footer: a real letter is issued by the backend under a
// licensed signer's name, and this demo must never produce something that could pass for one.

import { jsPDF } from 'jspdf'
import logoUrl from '../assets/savy-logo.png'
import { BRAND } from './brand'
import { longDate } from './format'
import { INVESTOR_TYPE_LABEL, PATHWAY_LABEL, type CheckResult, type InvestorType, type Pathway } from './types'

export interface LetterData {
  holderName: string
  investorType: InvestorType
  pathway: Pathway
  letterRef: string
  verifiedAt: string
  expiresAt: string
  checks: { label: string; result: CheckResult }[]
  /** The fund the letter is addressed to; omitted for a general letter. */
  recipient?: string
}

const BASIS: Record<Pathway, string> = {
  net_worth: 'individual net worth exceeding $1,000,000, excluding the value of the primary residence (Rule 501(a)(5))',
  income: 'income exceeding $200,000 individually, or $300,000 jointly, in each of the two most recent years, with a reasonable expectation of the same in the current year (Rule 501(a)(6))',
  license: 'holding in good standing a Series 7, 65 or 82 license (Rule 501(a)(10))',
  min_investment: 'a minimum investment commitment with written representations that it is not financed by a third party, consistent with SEC staff guidance of March 2025',
  entity_assets: 'an entity with total assets exceeding $5,000,000, not formed for the specific purpose of the investment (Rule 501(a)(3) and (a)(9))',
  all_owners_accredited: 'an entity in which every equity owner is an accredited investor (Rule 501(a)(8))',
  registered_adviser: 'registration as an investment adviser, or status as an exempt reporting adviser (Rule 501(a)(1))',
}

async function dataUrl(src: string): Promise<string> {
  const blob = await (await fetch(src)).blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

const INK: [number, number, number] = [20, 20, 20]
const MUTED: [number, number, number] = [104, 104, 104]
const FOREST: [number, number, number] = [4, 73, 58]

/** Builds the letter without saving it. */
export async function buildLetter(d: LetterData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 64
  const width = W - M * 2
  let y = M

  // Watermark first, so everything else prints over it.
  doc.setTextColor(232, 232, 232)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(92)
  doc.text('EXAMPLE', W / 2, H / 2 + 40, { align: 'center', angle: 32 })

  try {
    doc.addImage(await dataUrl(logoUrl), 'PNG', M, y - 6, 92, 36, 'logo', 'FAST')
  } catch {
    doc.setTextColor(...FOREST)
    doc.setFontSize(20)
    doc.text(BRAND.name, M, y + 18)
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  doc.text([`Reference ${d.letterRef}`, `Issued ${longDate(d.verifiedAt)}`], W - M, y + 6, { align: 'right' })
  y += 70

  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Accredited Investor Verification Letter', M, y)
  y += 30

  const para = (text: string, gap = 14, size = 11) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...INK)
    const lines = doc.splitTextToSize(text, width) as string[]
    doc.text(lines, M, y, { lineHeightFactor: 1.45 })
    y += lines.length * size * 1.45 + gap
  }

  para(d.recipient ? `To: ${d.recipient}` : 'To whom it may concern:', 10)
  para(
    `This letter confirms that ${BRAND.name} has taken reasonable steps to verify that ${d.holderName} (${INVESTOR_TYPE_LABEL[d.investorType].toLowerCase()}) is an "accredited investor" as defined in Rule 501(a) of Regulation D under the Securities Act of 1933, for purposes of an offering made in reliance on Rule 506(c).`,
  )
  para(`Basis of verification: ${PATHWAY_LABEL[d.pathway]}, meaning ${BASIS[d.pathway]}.`)

  // Key facts
  const facts: [string, string][] = [
    ['Investor', d.holderName],
    ['Basis', PATHWAY_LABEL[d.pathway]],
    ['Verified on', longDate(d.verifiedAt)],
    ['Valid through', longDate(d.expiresAt)],
  ]
  doc.setDrawColor(220, 220, 220)
  doc.line(M, y, W - M, y)
  y += 20
  facts.forEach(([k, v], i) => {
    const x = M + (i % 2) * (width / 2)
    if (i % 2 === 0 && i > 0) y += 36
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MUTED)
    doc.text(k.toUpperCase(), x, y)
    doc.setFontSize(11.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    doc.text(v, x, y + 15)
  })
  y += 40
  doc.line(M, y, W - M, y)
  y += 26

  // Checks performed
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Checks performed', M, y)
  y += 18
  for (const c of d.checks) {
    const mark = c.result === 'pass' ? 'Passed' : c.result === 'warn' ? 'Reviewed' : 'Not passed'
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...INK)
    doc.text(c.label, M + 12, y)
    doc.setTextColor(...(c.result === 'fail' ? ([155, 53, 39] as [number, number, number]) : FOREST))
    doc.text(mark, W - M, y, { align: 'right' })
    y += 17
  }
  y += 14

  para(
    `This letter does not disclose the investor's documents, account balances, income or net worth. ${BRAND.name} retains the full verification record, including each step taken and when, and makes it available to the issuer on request. This verification is valid for 90 days from the date above.`,
    24,
    10,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(`${BRAND.name} Verification`, M, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(`Reference ${d.letterRef}`, M, y + 15)

  // Footer: the specimen notice, on every letter
  doc.setDrawColor(220, 220, 220)
  doc.line(M, H - 78, W - M, H - 78)
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(
    doc.splitTextToSize(
      `EXAMPLE LETTER generated in ${BRAND.name}'s demo environment. It is not a verification letter and is not valid for any offering. ${BRAND.name} does not provide legal, tax or investment advice.`,
      width,
    ) as string[],
    M,
    H - 62,
  )

  return doc
}

export async function downloadLetter(d: LetterData) {
  const doc = await buildLetter(d)
  doc.save(`${BRAND.name}-verification-letter-${d.letterRef}.pdf`)
}
