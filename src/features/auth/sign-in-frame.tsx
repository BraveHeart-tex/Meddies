import type { ReactNode } from 'react'

/** The access page's blush welcome and bottom sheet, shared with its route fallback. */
export function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh w-full flex-col bg-accent">
      <div className="flex flex-1 flex-col items-center justify-center gap-4.5 px-5 pt-[calc(1.75rem+env(safe-area-inset-top,0px))] pb-5">
        <TwoCapsulesLogo />
        <p className="text-[2.75rem] leading-none font-black tracking-tight text-accent-foreground">
          Meddies
        </p>
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 rounded-t-4xl bg-background px-5 pt-7 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] shadow-drawer">
        {children}
      </div>
    </main>
  )
}

/** Master artwork from the design kit. Keep the vertical centre seam. */
function TwoCapsulesLogo() {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className="size-[min(8.5rem,34vw)] overflow-hidden rounded-[25%]"
    >
      <defs>
        <clipPath id="two-capsules-right">
          <rect x="50" width="50" height="100" />
        </clipPath>
      </defs>
      <rect width="100" height="100" fill="#b23a66" />
      <rect
        x="35"
        y="17.63"
        width="30"
        height="56.87"
        rx="15"
        fill="#fff"
        transform="rotate(-45 50 59.5)"
      />
      <g clipPath="url(#two-capsules-right)">
        <rect
          x="35"
          y="17.63"
          width="30"
          height="56.87"
          rx="15"
          fill="#e9a3b6"
          transform="rotate(45 50 59.5)"
        />
      </g>
    </svg>
  )
}
