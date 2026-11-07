'use client'

import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'

// Cozy Care toast: quiet cocoa confirmation above the bottom nav that states what was saved.
const toast = ToastPrimitive.createToastManager()

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

// Bottom offset clears the floating nav in AppShell (70px tall, 1rem or safe-area inset below).
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+5rem)] z-50 mx-auto max-w-2xl outline-none',
        className,
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        'group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-lg bg-foreground text-primary-foreground shadow-toast will-change-transform outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        '[--gap:0.625rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.625rem] [--scale:calc(max(0,1-(var(--toast-index)*0.06)))] [--shrink:calc(1-var(--scale))]',
        'h-(--height) transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_320ms_var(--ease-calm),opacity_220ms_var(--ease-calm),height_140ms_var(--ease-calm)] motion-reduce:[transition:opacity_220ms_var(--ease-calm)]',
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        'data-expanded:h-(--toast-height) data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
        'data-limited:opacity-0 data-starting-style:opacity-0 data-starting-style:transform-[translateY(0.5rem)]',
        '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:opacity-0 [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:transform-[translateY(0.5rem)]',
        'data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        className,
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        'flex h-full min-h-13 flex-wrap items-center gap-2.5 overflow-hidden py-2 pr-2 pl-3.5 transition-opacity duration-220 ease-calm motion-reduce:transition-none data-behind:opacity-0 data-expanded:opacity-100',
        className,
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn('text-body-sm font-bold wrap-anywhere', className)}
      {...props}
    />
  )
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-label font-semibold text-primary-foreground/75', className)}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <Button variant="ghost" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn(
        'shrink-0 bg-primary-foreground/12 font-extrabold text-accent hover:bg-primary-foreground/20 active:bg-primary-foreground/20 focus-visible:outline-accent',
        className,
      )}
      {...props}
    />
  )
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Dismiss"
      render={render}
      className={cn(
        'shrink-0 text-primary-foreground/75 hover:bg-primary-foreground/12 hover:text-primary-foreground active:bg-primary-foreground/12 focus-visible:outline-accent',
        className,
      )}
      {...props}
    >
      {children ?? <Icon name="close" size={14} />}
    </ToastPrimitive.Close>
  )
}

// Toast types map to the dose status grammar: glyph on a pale status chip.
const toastIcons: Record<string, { name: IconName; className: string }> = {
  success: { name: 'check', className: 'bg-dose-taken text-dose-taken-foreground' },
  skipped: { name: 'skipped', className: 'bg-dose-skipped text-dose-skipped-foreground' },
  warning: { name: 'warning', className: 'bg-dose-unlogged text-dose-unlogged-foreground' },
  error: { name: 'close', className: 'bg-accent text-destructive' },
}

function ToastIcon({ type }: { type: string | undefined }) {
  if (type === 'loading') {
    return (
      <span
        data-slot="toast-icon"
        className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-primary-foreground/12"
      >
        <Loader2Icon
          aria-hidden="true"
          className="size-3.5 animate-spin motion-reduce:animate-none"
        />
      </span>
    )
  }

  const icon = type ? toastIcons[type] : undefined
  if (!icon) {
    return null
  }

  return (
    <span
      data-slot="toast-icon"
      className={cn(
        'flex size-6.5 shrink-0 items-center justify-center rounded-full',
        icon.className,
      )}
    >
      <Icon name={icon.name} size={14} strokeWidth={2.4} />
    </span>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 basis-24 flex-col gap-0.5">
          <ToastTitle />
          <ToastDescription />
        </div>
        {toastItem.actionProps ? <ToastAction className="ml-auto" /> : null}
      </ToastContent>
    </Toast>
  ))
}

function Toaster({ children, toastManager = toast, ...props }: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastIcon,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toast,
  useToastManager,
}
