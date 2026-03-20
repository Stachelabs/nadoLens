"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ThemeToggle } from "./ThemeToggle";

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
                "border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200",
                pathname === `/wallet/${address}` && "bg-purple-500/20 text-purple-200",
              )}
            >
              My Wallet
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted
              const connected = ready && account && chain

              if (!ready) return <div aria-hidden style={{ opacity: 0 }} />

              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className={cn(
                      buttonVariants({ variant: 'default', size: 'sm' }),
                      'bg-purple-600 hover:bg-purple-700 text-white',
                    )}
                  >
                    Connect Wallet
                  </button>
                )
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className={buttonVariants({ variant: 'destructive', size: 'sm' })}
                  >
                    Wrong network
                  </button>
                )
              }

              return (
                <div className="flex items-center gap-1">
                  {chain.hasIcon && (
                    <button
                      onClick={openChainModal}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7')}
                      title={chain.name}
                    >
                      {chain.iconUrl && (
                        <img src={chain.iconUrl} alt={chain.name} className="size-4 rounded-full" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={openAccountModal}
                    className={cn(
                      buttonVariants({ variant: 'secondary', size: 'sm' }),
                      'font-mono text-xs',
                    )}
                  >
                    {account.displayName}
                  </button>
                </div>
              )
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </nav>
  );
}
