import { useRef } from 'react'
import { PackageCheck, PackagePlus, PackageX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { stockLeft } from '@/lib/quantity-policy'
import type { Medicine } from './contract'
import { MedicationInsetGroup, MedicationInsetRow } from './medication-inset-list'
import { stockCopy } from './stock-copy'

/* The stock Drawer (238·A3) shows the count and opens the action drawers. It saves nothing itself. */
export function StockOptionsDrawer({
  medicine,
  count,
  open,
  onClose,
  onClosed,
  onRefill,
  onChangeCount,
  onStop,
}: {
  medicine: Medicine
  count: number | null
  open: boolean
  onClose: () => void
  onClosed: () => void
  onRefill: () => void
  onChangeCount: () => void
  onStop: () => void
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed()
      }}
    >
      <DrawerContent initialFocus={titleRef} finalFocus={false}>
        <div className="flex flex-col gap-4.5">
          <DrawerHeader>
            <div className="flex items-start justify-between gap-3">
              <DrawerTitle ref={titleRef} tabIndex={-1} className="outline-none">
                {stockCopy.optionsTitle(medicine.label)}
              </DrawerTitle>
              <DrawerClose
                render={<Button type="button" size="icon" variant="ghost" />}
                aria-label="Close"
              >
                <X aria-hidden="true" />
              </DrawerClose>
            </div>
            {count !== null && (
              <DrawerDescription>{stockLeft(count, medicine.unit)}</DrawerDescription>
            )}
          </DrawerHeader>
          <div className="pb-2">
            <MedicationInsetGroup>
              <MedicationInsetRow icon={PackagePlus} label={stockCopy.refill} onClick={onRefill} />
              <MedicationInsetRow
                icon={PackageCheck}
                label={stockCopy.change}
                onClick={onChangeCount}
              />
              <MedicationInsetRow icon={PackageX} label={stockCopy.stop} onClick={onStop} />
            </MedicationInsetGroup>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
