"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ThemeToggle } from "./ThemeToggle";
import { WalletButton } from "./WalletButton";

const navLinks = [{ href: "/wallet", label: "Wallet Explorer" }];

export function Nav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        {/* Logo */}
        <Link
          href="/wallet"
          className="font-bold leading-none tracking-tight text-foreground uppercase"
        >
          NadoLens
        </Link>

        {/* Links */}
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
                "border border-purple-500/40 bg-purple-500/20 hover:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:text-purple-600 dark:hover:text-purple-200",
                pathname === `/wallet/${address}`,
                // &&
                // "bg-purple-500/20 text-purple-700",
              )}
            >
              My Wallet
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <WalletButton />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
