"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ThemeToggle } from "./ThemeToggle";
import { WalletButton } from "./WalletButton";

const navLinks = [
  { href: "/protocol", label: "Protocol" },
  { href: "/wallet", label: "Wallet Explorer" },
];

export function Nav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      {/* ── Desktop: single row ── */}
      <div className="mx-auto hidden h-14 max-w-7xl items-center gap-6 px-4 sm:flex">
        <Link
          href="/"
          className="font-bold leading-none tracking-tight text-foreground uppercase"
        >
          NadoLens
        </Link>

        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  buttonVariants({
                    variant: isActive ? "secondary" : "ghost",
                    size: "sm",
                  }),
                  !isActive && "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}

          {isConnected && address && (
            <Link
              href={`/wallet/${address}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-brand/40 bg-brand/20 hover:bg-brand/10 text-brand hover:text-brand/80",
                pathname === `/wallet/${address}`,
              )}
            >
              My Wallet
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <WalletButton />
          <ThemeToggle />
        </div>
      </div>

      {/* ── Mobile: single row ── */}
      <div className="flex h-14 items-center justify-between px-3 sm:hidden">
        <Link
          href="/"
          className="font-bold leading-none tracking-tight text-foreground uppercase"
        >
          NadoLens
        </Link>

        <div className="flex items-center gap-2">
          <WalletButton />
          <ThemeToggle />
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-8",
              )}
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-2 pt-2">
                {[{ href: "/", label: "Home" }, ...navLinks].map(
                  ({ href, label }) => {
                    const onMyWallet =
                      isConnected &&
                      address &&
                      pathname === `/wallet/${address}`;
                    const isActive =
                      href === "/"
                        ? pathname === "/"
                        : pathname?.startsWith(href) && !onMyWallet;
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          buttonVariants({
                            variant: isActive ? "secondary" : "ghost",
                          }),
                          "justify-start",
                          !isActive && "text-muted-foreground",
                        )}
                      >
                        {label}
                      </Link>
                    );
                  },
                )}
                {isConnected && address && (
                  <Link
                    href={`/wallet/${address}`}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "justify-start text-brand hover:text-brand/80",
                      pathname === `/wallet/${address}` && "bg-brand/10",
                    )}
                  >
                    My Wallet
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
