'use client'

import { X } from 'lucide-react'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { quantityProblem, unitName } from '@/lib/quantity-policy'
import { offGridCount, omega3, omega3Tracked, stockCopy } from './stock-model'
import { DetailBody, DetailFrame } from './stock-screens'

const noop = () => {}

function DrawerTop({ title, description }: { title: string; description: string }) {
  return (
    <DrawerHeader>
      <div className="flex items-start justify-between gap-3">
        <DrawerTitle tabIndex={-1} className="outline-none">
          {title}
        </DrawerTitle>
        <DrawerClose render={<Button size="icon" variant="ghost" />} aria-label="Close">
          <X aria-hidden="true" />
        </DrawerClose>
      </div>
      <DrawerDescription>{description}</DrawerDescription>
    </DrawerHeader>
  )
}

/* 392·S1 Turn-on drawer, opened from Track stock (392·A1): the starting count in the Medicine's
   dose unit on QuantityStepper, typing allowed, zero allowed, empty on every open. Here 7.5
   capsules after the first submit: the unit's grid error under the control, above its help.
   Saving and might not have saved follow the Archive confirm (292·S5): a saving label, then the
   retry alert above the primary. */
export function StockOnDrawerScreen() {
  const medicine = omega3
  return (
    <DetailFrame medicine={medicine}>
      <DetailBody medicine={medicine} stock={false} />
      <Drawer open>
        <DrawerContent>
          <DrawerTop
            title={stockCopy.drawerTitle(medicine.label)}
            description={stockCopy.drawerBody(unitName(null, medicine.unit))}
          />
          <Field data-invalid>
            <FieldLabel htmlFor="stock-count">{stockCopy.countLabel}</FieldLabel>
            <QuantityStepper
              id="stock-count"
              label={stockCopy.countLabel}
              unit={medicine.unit}
              value={offGridCount}
              onValueChange={noop}
              grow
              aria-invalid
              aria-describedby="stock-count-error stock-count-help"
            />
            <FieldError id="stock-count-error">
              {quantityProblem(offGridCount, medicine.unit)}
            </FieldError>
            <FieldDescription id="stock-count-help">{stockCopy.countHelp}</FieldDescription>
          </Field>
          <Button size="drawer">{stockCopy.start}</Button>
          <Button variant="ghost">Cancel</Button>
        </DrawerContent>
      </Drawer>
    </DetailFrame>
  )
}

/* 392·S2 Turn-off confirm, opened from Stop tracking (392·A2): the Archive confirm's shape
   (292·S5). It says Meddies stops counting and asks for a fresh count next time; saving and might
   not have saved follow the Archive confirm. */
export function StockOffDrawerScreen() {
  const medicine = omega3Tracked
  return (
    <DetailFrame medicine={medicine}>
      <DetailBody medicine={medicine} stock={false} />
      <Drawer open>
        <DrawerContent>
          <DrawerTop
            title={stockCopy.confirmTitle(medicine.label)}
            description={stockCopy.confirmBody(medicine.label)}
          />
          <Button size="drawer">{stockCopy.stop}</Button>
          <Button variant="ghost">Cancel</Button>
        </DrawerContent>
      </Drawer>
    </DetailFrame>
  )
}
