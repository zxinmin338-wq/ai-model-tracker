"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive =
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`relative pb-1 transition-colors ${
        isActive
          ? "text-[#1A2332] after:absolute after:bottom-[-18px] after:left-0 after:right-0 after:h-[2px] after:bg-[var(--accent-aurora)]"
          : "text-[#6B7785] hover:text-[#1A2332]"
      }`}
    >
      {children}
    </Link>
  );
}
