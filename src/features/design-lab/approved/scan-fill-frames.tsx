import type { LabFrame } from '../frames'
import { nameOnlyMatch, partialMatch, unsupportedMatch } from './scan-fill-model'
import { ScanFillScreen } from './scan-fill-screens'

/**
 * #473 Scan partial fill and unsupported form: approved Direction B, Note at the row. The Add
 * medicine drawer (`B·Drawer`) back from the Scanner when the Catalog product lacks details keeps
 * B·Barcode read and the manual form's rows as they are; an unsupported form adds the note as the
 * Type row's help line. Saving, might not have saved and rejected reuse the Add medicine form's
 * existing states. #198 builds these frames.
 */
export const scanFillFrames = [
  {
    slug: '473-b1',
    citation: '473·B1',
    title: 'Scan fill - Partial',
    render: () => <ScanFillScreen match={partialMatch} />,
  },
  {
    slug: '473-b2',
    citation: '473·B2',
    title: 'Scan fill - Name only',
    render: () => <ScanFillScreen match={nameOnlyMatch} />,
  },
  {
    slug: '473-b3',
    citation: '473·B3',
    title: 'Scan fill - Unsupported form',
    render: () => <ScanFillScreen match={unsupportedMatch} />,
  },
  {
    slug: '473-b4',
    citation: '473·B4',
    title: 'Scan fill - Unsupported, Type menu',
    render: () => <ScanFillScreen match={unsupportedMatch} menuOpen />,
  },
] satisfies readonly LabFrame[]
