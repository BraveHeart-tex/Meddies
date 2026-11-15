import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'

export function DiscardMedicineChanges({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Discard these changes?</DrawerTitle>
          <DrawerDescription>The changes you haven’t saved will be lost.</DrawerDescription>
        </DrawerHeader>
        <Button size="drawer" onClick={onDiscard}>
          Discard changes
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Keep editing
        </Button>
      </DrawerContent>
    </Drawer>
  )
}
