import { ReactNode } from "react";
import { ThemeToggle } from "./Editor/ThemeToggle";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export function SiteHeader({
  name = "Documents",
  breadcrumbs,
  children,
}: {
  name?: string;
  breadcrumbs?: { label: string; href?: string }[];
  children?: ReactNode;
}) {
  const { state, isMobile } = useSidebar();
  const showTrigger = state === "collapsed" || isMobile;

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-white dark:bg-card transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        {showTrigger && <SidebarTrigger className="size-7 -ml-1 mr-1" />}
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="flex items-center gap-1.5 text-[0.8rem]">
            {breadcrumbs.map((crumb, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 "
              >
                {i > 0 && (
                  <span className="text-[#888] text-[0.65rem]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      className="lucide lucide-chevron-right-icon lucide-chevron-right"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                )}
                <span
                  className={
                    i === breadcrumbs.length - 1
                      ? "font-semibold text-[#1a1a2e] "
                      : "font-medium text-[#a5a2b4] hover:text-[#6C5CE7] cursor-pointer transition-colors"
                  }
                >
                  {crumb.label}
                </span>
              </span>
            ))}
          </nav>
        ) : (
          <h1 className="text-base font-medium">{name}</h1>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {children}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
